"""Policy / value network for Spirit Island, its checkpoints, and its export for
the TypeScript side.

Inputs are the env's padded token blocks (training/spirit/vec-env.ts, encoded by
src/engine/observe.ts): one token per land, Spirit and card, plus a global and a
decision token, and one row per option of the current decision.

    embed      each token type: Σ embeddings of its categorical columns + Linear(numeric),
               then a residual MLP; plus a token-type embedding
    trunk      `layers` pre-norm transformer blocks over [global, decision, spirits, lands, cards];
               attention between two lands gets a learned bias per head for their hop distance,
               padded tokens are masked out as keys
    options    each option: its own embedding + the outputs of the land / card / Spirit tokens it
               refers to + the decision token → MLP → one logit (illegal options masked)
    value      MLP on [global, decision] outputs

The network never sees a fixed action list: it scores whatever options a decision
offers, so every Spirit, card and rule shares one head. With `amp`, the trunk runs in
bfloat16 on CUDA and the heads in float32 (PPO ratios aren't computed from bf16 logits).
"""

from __future__ import annotations

import base64
import json
import math
import os

import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

POLICY_FORMAT = "spirit-island/tokens@1"
GAME = "spirit-island"
ILLEGAL_LOGIT = -1e9
TOKEN_TYPES = ("global", "decision", "spirit", "land", "card")


def _linear(n_in: int, n_out: int, gain: float, bias: bool = True) -> nn.Linear:
    layer = nn.Linear(n_in, n_out, bias=bias)
    nn.init.orthogonal_(layer.weight, gain=gain)
    if bias:
        nn.init.zeros_(layer.bias)
    return layer


def _mlp(n_in: int, d: int, n_out: int, out_gain: float) -> nn.Sequential:
    return nn.Sequential(_linear(n_in, d, math.sqrt(2)), nn.ReLU(), _linear(d, n_out, out_gain))


class TokenIn(nn.Module):
    """Σ embedding(categorical column) + Linear(numeric features), then a residual MLP."""

    def __init__(self, vocab: list[int], n_num: int, d: int):
        super().__init__()
        self.embs = nn.ModuleList(nn.Embedding(v, d) for v in vocab)
        for e in self.embs:
            nn.init.normal_(e.weight, std=0.1)
        self.num = _linear(n_num, d, 1.0)
        self.mlp = nn.Sequential(nn.LayerNorm(d), _linear(d, d, math.sqrt(2)), nn.ReLU(), _linear(d, d, 1.0))

    def forward(self, num: torch.Tensor, cat: torch.Tensor) -> torch.Tensor:
        x = self.num(num)
        for k, e in enumerate(self.embs):
            x = x + e(cat[..., k].clamp(0, e.num_embeddings - 1))
        return x + self.mlp(x)


class Block(nn.Module):
    """Pre-norm transformer block with an additive attention bias [B, heads, T, T]."""

    def __init__(self, d: int, heads: int, ffn: int):
        super().__init__()
        self.heads = heads
        self.ln1 = nn.LayerNorm(d)
        self.qkv = _linear(d, 3 * d, 1.0)
        self.proj = _linear(d, d, 1.0)
        self.ln2 = nn.LayerNorm(d)
        self.ff = nn.Sequential(_linear(d, ffn, math.sqrt(2)), nn.GELU(), _linear(ffn, d, 1.0))

    def forward(self, x: torch.Tensor, bias: torch.Tensor) -> torch.Tensor:
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(b, t, 3, self.heads, d // self.heads).permute(2, 0, 3, 1, 4)
        a = F.scaled_dot_product_attention(q, k, v, attn_mask=bias.to(q.dtype))
        x = x + self.proj(a.transpose(1, 2).reshape(b, t, d))
        return x + self.ff(self.ln2(x))


def _gather(tokens: torch.Tensor, ref: torch.Tensor) -> torch.Tensor:
    """tokens [B, N, d], ref [B, O] (−1 = none) → [B, O, d], zeros where ref is −1."""
    d = tokens.shape[-1]
    idx = ref.clamp(min=0, max=tokens.shape[1] - 1)
    out = torch.gather(tokens, 1, idx[..., None].expand(-1, -1, d))
    return out * (ref >= 0)[..., None].to(out.dtype)


class SpiritNet(nn.Module):
    def __init__(self, spec: dict, width: int = 96, layers: int = 4, heads: int = 4, ffn: int = 384):
        super().__init__()
        if width % heads:
            raise ValueError("width must be a multiple of heads")
        self.spec = {k: spec[k] for k in ("obsVersion", "shape", "num", "cat", "refs", "vocab", "maxDist")}
        self.width, self.n_layers, self.heads, self.ffn = width, layers, heads, ffn
        v, n, d = spec["vocab"], spec["num"], width
        self.land_in = TokenIn(v["land"], n["land"], d)
        self.spirit_in = TokenIn(v["spirit"], n["spirit"], d)
        self.card_in = TokenIn(v["card"], n["card"], d)
        self.global_in = TokenIn(v["global"], n["global"], d)
        self.decision_in = TokenIn(v["decision"], n["decision"], d)
        self.option_in = TokenIn(v["option"], n["option"], d)
        self.type_emb = nn.Embedding(len(TOKEN_TYPES), d)
        nn.init.normal_(self.type_emb.weight, std=0.1)
        self.dist_bias = nn.Embedding(spec["maxDist"] + 1, heads)
        nn.init.zeros_(self.dist_bias.weight)
        self.blocks = nn.ModuleList(Block(d, heads, ffn) for _ in range(layers))
        self.norm = nn.LayerNorm(d)
        # Small policy init → near-uniform play at the start; value starts near 0.
        self.option_head = nn.Sequential(_linear(5 * d, d, math.sqrt(2)), nn.ReLU(), _linear(d, 1, 0.01))
        self.value_head = _mlp(2 * d, d, 1, 1.0)
        self.amp = False

    @property
    def arch(self) -> dict:
        return {"spec": self.spec, "width": self.width, "layers": self.n_layers, "heads": self.heads, "ffn": self.ffn}

    def forward(self, o: dict) -> tuple[torch.Tensor, torch.Tensor]:
        """o: the env's arrays as tensors (Batch.OBS names). Returns option logits [B, O']
        (illegal options not yet masked: see masked_logits; O' ≤ O, the batch's most options,
        since padding past it is trimmed) and values [B]."""
        o = trim(o)
        P, L = o["spirit_mask"].shape[1], o["land_mask"].shape[1]
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=self.amp and o["global_num"].is_cuda):
            te = self.type_emb.weight
            g = self.global_in(o["global_num"], o["global_cat"])[:, None] + te[0]
            dec = self.decision_in(o["decision_num"], o["decision_cat"])[:, None] + te[1]
            sp = self.spirit_in(o["spirit_num"], o["spirit_cat"]) + te[2]
            ld = self.land_in(o["land_num"], o["land_cat"]) + te[3]
            cd = self.card_in(o["card_num"], o["card_cat"]) + te[4]
            x = torch.cat([g, dec, sp, ld, cd], 1)
            b, t, _ = x.shape
            valid = torch.cat([torch.ones(b, 2, dtype=torch.bool, device=x.device), o["spirit_mask"], o["land_mask"], o["card_mask"]], 1)
            bias = torch.zeros(b, self.heads, t, t, device=x.device, dtype=torch.float32)
            s0 = 2 + P
            bias[:, :, s0:s0 + L, s0:s0 + L] = self.dist_bias(o["dist"].clamp(0, self.spec["maxDist"])).permute(0, 3, 1, 2).float()
            bias = bias.masked_fill(~valid[:, None, None, :], float("-inf"))
            for blk in self.blocks:
                x = blk(x, bias)
        x = self.norm(x.float())
        g_out, d_out = x[:, 0], x[:, 1]
        sp_out, ld_out, cd_out = x[:, 2:2 + P], x[:, s0:s0 + L], x[:, s0 + L:]
        opt = self.option_in(o["option_num"], o["option_cat"])
        ref = o["option_ref"]
        z = torch.cat([opt, _gather(ld_out, ref[..., 0]), _gather(cd_out, ref[..., 1]), _gather(sp_out, ref[..., 2]),
                       d_out[:, None].expand(-1, opt.shape[1], -1)], -1)
        logits = self.option_head(z).squeeze(-1)
        value = self.value_head(torch.cat([g_out, d_out], -1)).squeeze(-1)
        return logits, value


def trim(o: dict) -> dict:
    """Drop card / option padding past the batch's largest count (most decisions use far
    fewer than the padded sizes, and the network's cost grows with them)."""
    c = max(1, int(o["card_mask"].sum(1).max()))
    k = max(1, int(o["option_mask"].sum(1).max()))
    out = dict(o)
    for name in ("card_num", "card_cat", "card_mask"):
        out[name] = o[name][:, :c]
    for name in ("option_num", "option_cat", "option_ref", "option_mask"):
        out[name] = o[name][:, :k]
    return out


def masked_logits(logits: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Illegal options → a huge negative logit (`mask` may be wider than the trimmed logits)."""
    return logits.masked_fill(~mask[:, : logits.shape[1]], ILLEGAL_LOGIT)


INT_INPUTS = ("land_cat", "dist", "spirit_cat", "card_cat", "global_cat", "decision_cat", "decision_ref", "option_cat", "option_ref")
BOOL_INPUTS = ("land_mask", "spirit_mask", "card_mask", "option_mask")


def to_tensors(obs: dict, device: str | torch.device) -> dict:
    """The env's numpy arrays → tensors of the right dtypes on `device`."""
    out = {}
    for k, a in obs.items():
        t = torch.from_numpy(np.array(a, copy=True) if not a.flags.writeable else np.ascontiguousarray(a))
        if k in INT_INPUTS:
            t = t.long()
        elif k in BOOL_INPUTS:
            t = t.bool()
        out[k] = t.to(device, non_blocking=True)
    return out


def count_params(net: nn.Module) -> int:
    return sum(p.numel() for p in net.parameters())


# ---------------------------------------------------------------- policy files

def _b64(t: torch.Tensor) -> str:
    return base64.b64encode(np.ascontiguousarray(t.detach().float().cpu().numpy(), dtype="<f4").tobytes()).decode()


def export_policy(net: SpiritNet, path: str, meta: dict | None = None) -> None:
    """Every tensor as base64 little-endian float32 (row-major, PyTorch layout), keyed
    by its state_dict name, with the architecture and the encoding it was trained on.
    (Shipping to the browser will use a smaller, quantised format.)"""
    doc = {
        "format": POLICY_FORMAT,
        "game": GAME,
        "obsVersion": net.spec["obsVersion"],
        "arch": net.arch,
        "tensors": {k: {"shape": list(v.shape), "data": _b64(v)} for k, v in net.state_dict().items()},
        "meta": meta or {},
    }
    _atomic_write(path, json.dumps(doc))


def net_from_arch(arch: dict) -> SpiritNet:
    return SpiritNet(arch["spec"], arch["width"], arch["layers"], arch["heads"], arch["ffn"])


# ---------------------------------------------------------------- shipped (int8) policy files
#
# The app ships a policy as one small binary (src/engine/nn/*.bin), read by the TypeScript
# runtime (src/engine/nn/runtime.ts):
#
#   "SIQ8" | u32 LE header length | header JSON (utf-8, padded with spaces to a multiple of 4) | blob
#
# The header carries the architecture and a tensor table; each tensor is either int8 (every
# 2-D weight and embedding table: one scale per row, symmetric, q = round(w / scale)) at
# `offset` with its float32 scales at `scaleOffset`, or raw float32 (biases, LayerNorm,
# the small bias tables) at `offset`. The value head is left out: playing needs only the policy.

QUANT_MAGIC = b"SIQ8"
QUANT_FORMAT = "spirit-island/tokens-q8@1"
_F32_ONLY = ("type_emb.weight", "dist_bias.weight")


def quantize_rows(w: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Symmetric int8, one scale per row (output channel / embedding row)."""
    rows = w.reshape(w.shape[0], -1)
    scale = np.abs(rows).max(axis=1) / 127.0
    scale = np.where(scale > 0, scale, 1.0).astype("<f4")
    q = np.clip(np.rint(rows / scale[:, None]), -127, 127).astype(np.int8)
    return q, scale


def export_quantized(net: SpiritNet, path: str, meta: dict | None = None) -> dict:
    """Write the shipped policy file; returns {bytes, params, int8_params}."""
    blob = bytearray()
    table = []

    def add(raw: bytes) -> int:
        while len(blob) % 4:
            blob.append(0)
        at = len(blob)
        blob.extend(raw)
        return at

    params = int8_params = 0
    for name, t in net.state_dict().items():
        if name.startswith("value_head."):
            continue
        w = t.detach().float().cpu().numpy()
        params += w.size
        if w.ndim == 2 and name not in _F32_ONLY:
            q, scale = quantize_rows(w)
            table.append({"name": name, "shape": list(w.shape), "dtype": "i8", "offset": add(q.tobytes()),
                          "scaleOffset": add(scale.tobytes())})
            int8_params += w.size
        else:
            table.append({"name": name, "shape": list(w.shape), "dtype": "f32",
                          "offset": add(np.ascontiguousarray(w, dtype="<f4").tobytes())})
    header = json.dumps({"format": QUANT_FORMAT, "game": GAME, "obsVersion": net.spec["obsVersion"], "arch": net.arch,
                         "tensors": table, "meta": meta or {}}, separators=(",", ":")).encode("utf-8")
    header += b" " * (-len(header) % 4)
    data = QUANT_MAGIC + len(header).to_bytes(4, "little") + header + bytes(blob)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return {"bytes": len(data), "params": params, "int8_params": int8_params}


def read_quantized(path: str) -> tuple[dict, dict[str, np.ndarray]]:
    """The header and the dequantized float32 tensors of a shipped policy file."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != QUANT_MAGIC:
        raise ValueError(f"{path} is not a shipped policy (bad magic)")
    n = int.from_bytes(data[4:8], "little")
    header = json.loads(data[8:8 + n].decode("utf-8"))
    if header.get("format") != QUANT_FORMAT or header.get("game") != GAME:
        raise ValueError(f"{path} is not a {GAME} policy ({header.get('format')}, {header.get('game')})")
    blob = memoryview(data)[8 + n:]
    out = {}
    for t in header["tensors"]:
        shape, count = t["shape"], int(np.prod(t["shape"]))
        if t["dtype"] == "i8":
            q = np.frombuffer(blob, dtype=np.int8, count=count, offset=t["offset"]).reshape(shape[0], -1).astype(np.float32)
            scale = np.frombuffer(blob, dtype="<f4", count=shape[0], offset=t["scaleOffset"])
            out[t["name"]] = (q * scale[:, None]).reshape(shape)
        else:
            out[t["name"]] = np.frombuffer(blob, dtype="<f4", count=count, offset=t["offset"]).reshape(shape).copy()
    return header, out


def load_quantized(path: str, obs_version: int | None = None, device: str | torch.device = "cpu") -> SpiritNet:
    """A network with the shipped (dequantized) weights, for evals and parity checks. Its value head is untrained."""
    header, tensors = read_quantized(path)
    if obs_version is not None and header.get("obsVersion") != obs_version:
        raise ValueError(f"{path} was trained on observation v{header.get('obsVersion')}, this build is v{obs_version}")
    net = net_from_arch(header["arch"])
    missing = net.load_state_dict({k: torch.from_numpy(v) for k, v in tensors.items()}, strict=False)
    if [k for k in missing.missing_keys if not k.startswith("value_head.")] or missing.unexpected_keys:
        raise ValueError(f"{path}: tensors do not match the architecture ({missing})")
    return net.to(device).eval()


def load_policy(path: str, obs_version: int | None = None, device: str | torch.device = "cpu") -> SpiritNet:
    if path.endswith(".bin"):
        return load_quantized(path, obs_version, device)
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    if doc.get("format") != POLICY_FORMAT or doc.get("game") != GAME:
        raise ValueError(f"{path} is not a {GAME} policy ({doc.get('format')}, {doc.get('game')})")
    if obs_version is not None and doc.get("obsVersion") != obs_version:
        raise ValueError(f"{path} was trained on observation v{doc.get('obsVersion')}, this build is v{obs_version}")
    net = net_from_arch(doc["arch"])
    state = {k: torch.from_numpy(np.frombuffer(base64.b64decode(t["data"]), dtype="<f4").copy().reshape(t["shape"]))
             for k, t in doc["tensors"].items()}
    net.load_state_dict(state)
    return net.to(device).eval()


# ---------------------------------------------------------------- checkpoints

def save_checkpoint(path: str, net: SpiritNet, optimizer: torch.optim.Optimizer, state: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    torch.save({"model": net.state_dict(), "optimizer": optimizer.state_dict(), "arch": net.arch, **state}, tmp)
    os.replace(tmp, path)


def load_checkpoint(path: str, device: str | torch.device = "cpu") -> dict:
    return torch.load(path, map_location=device, weights_only=False)


def net_from_checkpoint(ckpt: dict, device: str | torch.device = "cpu") -> SpiritNet:
    net = net_from_arch(ckpt["arch"]).to(device)
    net.load_state_dict(ckpt["model"])
    return net


def _atomic_write(path: str, text: str) -> None:
    """Readers (evals) never see a half-written file."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)

import { create } from 'zustand';

// One floating, enlarged card scan shown while hovering any card.
const usePreview = create<{ url: string | null; set: (url: string | null) => void }>((set) => ({
  url: null,
  set: (url) => set({ url }),
}));

export const showPreview = (url: string | null) => usePreview.getState().set(url);

export function CardPreviewHost() {
  const url = usePreview((s) => s.url);
  if (!url) return null;
  return (
    <div className="card-preview" aria-hidden>
      <img src={url} alt="" />
    </div>
  );
}

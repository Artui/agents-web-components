/** Pixels between a selection and the offer to quote it. */
const GAP = 6;

/** The box an offer is positioned in: its top-left corner and width, in viewport pixels. */
export interface OfferBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/** Float the offer beside `rect`, above it when there is room and inside `box` horizontally. */
export function placeOffer(button: HTMLButtonElement, rect: DOMRect, box: OfferBox): void {
  // Unhidden first: a hidden element measures zero, and its own size decides both
  // whether it fits above the selection and how far to pull it left.
  button.hidden = false;
  const top = rect.top - box.top;
  // Selecting the first line is the ordinary case, and an offer clipped above is one nobody takes.
  const below = top < GAP + button.offsetHeight;
  button.dataset["below"] = String(below);
  button.style.top = `${below ? rect.bottom - box.top + GAP : top - GAP}px`;
  const half = button.offsetWidth / 2;
  const centre = rect.left + rect.width / 2 - box.left;
  button.style.left = `${Math.min(Math.max(centre, half), box.width - half)}px`;
}

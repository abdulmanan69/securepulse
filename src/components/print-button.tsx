'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 shrink-0 items-center rounded-sm bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink-hover"
    >
      Print or save as PDF
    </button>
  );
}

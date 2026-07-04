// M115 — état de chargement de l'app mobile inventaire.
export default function InventoryLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Chargement">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
    </div>
  );
}

// M115 — état de chargement du groupe (employee).
export default function EmployeeLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Chargement">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
    </div>
  );
}

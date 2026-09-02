// Offline fallback — página simples quando sem rede
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center">
      <div>
        <h1 className="text-xl font-bold text-white">Você está offline</h1>
        <p className="mt-2 text-sm text-gray-400">
          Reconecte-se para usar a interface de voz.
        </p>
      </div>
    </div>
  );
}

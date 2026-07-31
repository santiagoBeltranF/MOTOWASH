import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Controles de paginacion compartidos por las pantallas del panel.
 *
 * Antes ninguna de las tres enviaba `page` ni `limit`, asi que recibian el
 * valor por defecto del backend (20 filas) y no habia forma de llegar al resto:
 * con 150 citas, 130 eran inalcanzables (hallazgo E9).
 *
 * Se oculta solo cuando no hay nada que paginar, para no meter ruido en las
 * pantallas con pocos registros.
 */
export default function Paginacion ({ page, totalPages, total, limit, onChange, etiqueta = 'registros' }) {
  if (!total || totalPages <= 1) return null

  const desde = (page - 1) * limit + 1
  const hasta = Math.min(page * limit, total)

  const irA = (n) => {
    const destino = Math.min(Math.max(1, n), totalPages)
    if (destino !== page) onChange(destino)
  }

  // Ventana de como mucho 5 numeros alrededor de la pagina actual, para que la
  // barra no crezca sin control cuando hay muchas paginas.
  const inicio = Math.max(1, Math.min(page - 2, totalPages - 4))
  const numeros = Array.from({ length: Math.min(5, totalPages) }, (_, i) => inicio + i)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Mostrando <span className="font-medium text-gray-700">{desde}–{hasta}</span> de{' '}
        <span className="font-medium text-gray-700">{total}</span> {etiqueta}
      </p>

      <nav className="flex items-center gap-1" aria-label="Paginación">
        <button
          onClick={() => irA(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        {numeros.map(n => (
          <button
            key={n}
            onClick={() => irA(n)}
            aria-label={`Página ${n}`}
            aria-current={n === page ? 'page' : undefined}
            className={`min-w-[2rem] px-2 py-1 rounded-lg text-sm font-medium transition-colors ${
              n === page ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {n}
          </button>
        ))}

        <button
          onClick={() => irA(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>
    </div>
  )
}

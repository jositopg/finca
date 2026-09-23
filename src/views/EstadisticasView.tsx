import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { EvolucionAnual } from '../components/EvolucionAnual'
import { GastosPorCategoria } from '../components/GastosPorCategoria'
import { RankingRentabilidad } from '../components/RankingRentabilidad'
import { RepercutirSuministros } from '../components/RepercutirSuministros'
import { esDeAlquiler, esDeJose, rangoAnio } from '../types'
import type { View } from '../components/Nav'

interface Props {
  onNavigate: (v: View, propiedadId?: string) => void
}

export function EstadisticasView({ onNavigate }: Props) {
  const { propiedades, transacciones } = useApp()

  const currentYear = format(new Date(), 'yyyy')
  const [desdeAnio, hastaAnio] = rangoAnio(currentYear)

  // Mismo criterio que el Dashboard: solo propiedades de Jose (no las que
  // gestiona por cuenta de otros) y que sean de alquiler (no uso
  // propio/vivienda habitual).
  const propiedadesJose = propiedades.filter((p) => esDeJose(p) && esDeAlquiler(p))

  return (
    <div className="flex flex-col pb-24 lg:pb-10">
      <div className="px-5 pt-12 pb-5 lg:px-0 lg:pt-6">
        <h1 className="font-display text-2xl font-bold text-on-surface lg:text-3xl">Estadísticas</h1>
        <p className="text-sm text-outline-variant mt-0.5">Tu parte, propiedades en alquiler</p>
      </div>

      {propiedadesJose.length === 0 ? (
        <p className="px-5 text-sm text-outline-variant text-center py-8 lg:px-0">
          Aún no hay datos suficientes para mostrar estadísticas.
        </p>
      ) : (
        <>
          <div className="px-5 mb-7 lg:px-0">
            <EvolucionAnual propiedades={propiedadesJose} transacciones={transacciones} />
          </div>

          <div className="px-5 mb-7 lg:px-0">
            <RepercutirSuministros
              propiedades={propiedadesJose}
              transacciones={transacciones}
              desde={desdeAnio}
              hasta={hastaAnio}
              titulo={`A repercutir agua y luz ${currentYear}`}
              onSelectPropiedad={(id) => onNavigate('propiedades', id)}
            />
          </div>

          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            <div className="px-5 mb-7 lg:px-0 lg:mb-0">
              <GastosPorCategoria
                propiedades={propiedadesJose}
                transacciones={transacciones}
                desde={desdeAnio}
                hasta={hastaAnio}
                anioLabel={currentYear}
              />
            </div>

            <div className="px-5 lg:px-0">
              <RankingRentabilidad
                propiedades={propiedadesJose}
                transacciones={transacciones}
                onSelectPropiedad={(id) => onNavigate('propiedades', id)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

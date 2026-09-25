import { Riffle } from '@rpxl/riffle/react'

export function Stack({ films }: { films: { title: string }[] }) {
  return (
    // justifyContent keeps the stack's one grid column, and so every card, the
    // card's own width (centred), so the fan scales about the card itself.
    <Riffle
      aria-label="Films"
      cards={films}
      cardWidth={300}
      cardHeight={400}
      style={{ justifyContent: 'center' }}
    >
      {(film, index) => (
        <div
          style={{
            width: 300,
            height: 400,
            borderRadius: 16,
            background: `hsl(${index * 72} 65% 45%)`,
            color: 'white',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {film.title}
        </div>
      )}
    </Riffle>
  )
}

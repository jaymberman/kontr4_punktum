/**
 * J.S. Bach, after the 1748 Haussmann portrait.
 *
 * The tonal map below was sampled from the portrait itself rather than
 * drawn by hand: the source image was downscaled to this grid and each
 * cell's luminance quantized to a 10-step ramp. That is why the likeness
 * holds up — the wig mass, the shadowed eye sockets, the nose highlight
 * and the bright cravat are the painting's real values, not an
 * approximation of them.
 *
 * Resolution is deliberately higher than a classic 16x16 sprite. At that
 * size a recognizable Bach isn't achievable, so this trades some of the
 * chunky retro feel for an actual likeness while keeping the hard-edged,
 * quantized pixel treatment.
 *
 * Ramp, darkest to lightest: `.` `-` `:` `=` `+` `*` `#` `%` `@`
 */
const ART = [
  "............----..----.........-",
  "..........-=+**+::+++=--........",
  "........-=#%%%#**+****+=-----.--",
  ".......-+%%%%%%%%%###**+=---....",
  "......-+%%%%%@@%%%%####*+:-.....",
  ".....-=%%%%%@%%%%%%##***++--....",
  ".....:#%%%%%%#%%%%%###***+=-....",
  "....-+%%%%%%#%%%%%%%%#*+**=-....",
  "....:#%%%%%##%@@@%%%%##+=*+:--..",
  "....=%%%%%##%%@@@%%%%##+:*+:--..",
  "....*%%%%%#*%%@@@%%%%%#+:=+=---.",
  "...-*#%%#%#*%%%@%%%%%%#+:-++----",
  "...-*%%##%**%%%%%%%%%%#=--+*:---",
  "...-*##%*#*+%%#+=+*##*:---=*=---",
  "...:*#%###*+###*+==#+-:=--:+:---",
  "...=+#####*+#%*+=++#*:=:--=+:---",
  "...-****##*=#%%%#*#%#=+=:--=--.-",
  "...:+*###*+=##%%#%%%#+=++-.=:-.-",
  "...:+*#*+*+=*##%%####*:+=-.=:-.-",
  "...-+**+*+:=**####+===-+=-.::-.-",
  "...-+*++*=::**###*##+--==-.::-.-",
  "....==++*=::+*##**##+=:::-.-----",
  "....:=*+*=::+**##+++=:-=:-.-----",
  "....-++=+:--=*******+=::--.-----",
  "....-++:=:--=+***##*+=:--..-.---",
  ".....:=::---:==++*###+:-....----",
  ".....-::--.-=====+***=--....----",
  ".....----..-*#+++*+=:----..-----",
  "......------*@%*++=:------.-----",
  "......--.---=%@%%*=:------.-----",
  "....--......:%@@@%%*+=:---------",
  "..--........-*@@@@@%%+--..------",
  "---..........:%@@@@%*---.-----..",
  "---..........-#@@@@*---.------..",
] as const

/**
 * Ramp character to fill opacity. The darkest two steps render as nothing
 * so the portrait reads as a silhouette on the tinted tile instead of
 * sitting inside a dim rectangle.
 */
const OPACITY: Record<string, number> = {
  ".": 0,
  "-": 0,
  ":": 0.14,
  "=": 0.26,
  "+": 0.4,
  "*": 0.55,
  "#": 0.7,
  "%": 0.86,
  "@": 1,
}

const COLS = ART[0].length
const ROWS = ART.length

export function BachLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${COLS} ${ROWS}`}
      // No antialiasing between cells, which is what keeps the pixels
      // reading as pixels rather than as a blurry photo.
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="Johann Sebastian Bach"
    >
      {ART.flatMap((row, y) =>
        [...row].map((glyph, x) => {
          const opacity = OPACITY[glyph]
          if (!opacity) return null
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill="currentColor"
              opacity={opacity}
            />
          )
        }),
      )}
    </svg>
  )
}

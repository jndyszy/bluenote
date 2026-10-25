import { useLanguage } from '../context/LanguageContext'

/**
 * Brand logo lockup: the BlueNote icon followed by the app name.
 * Colour, weight and size are inherited from the surrounding brand element
 * (e.g. `s.logo`), and the icon scales with the font size via `1.25em`.
 * Pass `showText={false}` for an icon-only logo.
 */
export default function Logo({ showText = true }: { showText?: boolean }) {
  const { t } = useLanguage()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', verticalAlign: 'middle' }}>
      <img
        src="/logo.webp"
        alt={showText ? '' : t('app.name')}
        style={{ height: '1.25em', width: 'auto', display: 'block' }}
      />
      {showText && t('app.name')}
    </span>
  )
}

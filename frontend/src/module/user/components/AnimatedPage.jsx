export default function AnimatedPage({ children, className = "", style }) {
  return (
    <div style={style} className={`${className} md:pb-0`}>
      {children}
    </div>
  )
}

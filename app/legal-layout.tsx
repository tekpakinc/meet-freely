import Link from "next/link";
import "./legal.css";

export function LegalPage({kicker,title,children}:{kicker:string;title:string;children:React.ReactNode}) {
  return <main className="legal-page"><div className="legal-shell"><nav className="legal-nav"><Link className="brand" href="/">● meet freely</Link><Link href="/">Back to Meet Freely</Link></nav><p className="legal-kicker">{kicker}</p><h1>{title}</h1><p className="legal-updated">Effective August 17, 2026</p>{children}<div className="legal-links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community Guidelines</Link><Link href="/safety">Safety Center</Link></div></div></main>;
}

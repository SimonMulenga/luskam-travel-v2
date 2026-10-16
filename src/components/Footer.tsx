import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin } from "lucide-react";
import logo from "@/assets/luskam-logo.jpeg";
import { useSiteContent } from "@/hooks/useSiteContent";
import { NewsletterSignup } from "./NewsletterSignup";

const linkClass = "transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none";

export const Footer = () => {
  const { get } = useSiteContent();
  return (
    <footer id="contact" className="border-t border-primary-foreground/10 bg-[#0a1c35] text-white">
      <div className="container grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-[1.3fr_.75fr_.75fr_1fr] lg:gap-12 lg:py-16">
        <div>
          <Link to="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <img src={logo} alt="" className="h-11 w-11 rounded-xl bg-white object-cover" width={44} height={44} />
            <span className="leading-tight"><span className="block font-display text-lg">Luskam Travel Agents</span><span className="mt-1 block text-[10px] font-medium tracking-[.14em] text-white/60">EXPERTS AT ADVENTURE</span></span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">{get("footer_tagline", "Affordable. Reliable. Stress-free travel — flights, tours, accommodation and visa services.")}</p>
          <div className="mt-6 max-w-sm"><NewsletterSignup /></div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[.16em] text-white/50">Explore</h4>
          <ul className="mt-5 space-y-3 text-sm text-white/75">
            <li><Link to="/flights" className={linkClass}>Flights</Link></li>
            <li><Link to="/hotels" className={linkClass}>Hotels</Link></li>
            <li><Link to="/cars" className={linkClass}>Car rentals</Link></li>
            <li><Link to="/visa" className={linkClass}>Visa applications</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[.16em] text-white/50">Luskam</h4>
          <ul className="mt-5 space-y-3 text-sm text-white/75">
            <li><Link to="/#about" className={linkClass}>About us</Link></li>
            <li><Link to="/blog" className={linkClass}>Travel journal</Link></li>
            <li><Link to="/kakande" className={linkClass}>Kakande Ministries</Link></li>
            <li><a href="tel:+260773918145" className={`${linkClass} inline-flex items-center gap-1`}>Contact our team <ArrowUpRight className="h-3.5 w-3.5" /></a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[.16em] text-white/50">Get in touch</h4>
          <ul className="mt-5 space-y-3 text-sm text-white/75">
            <li><a href="https://wa.me/260773918145" target="_blank" rel="noreferrer" className={linkClass}>WhatsApp: +260 773 918 145</a></li>
            <li><a href="https://wa.me/260976652877" target="_blank" rel="noreferrer" className={linkClass}>WhatsApp: +260 976 652 877</a></li>
            <li><a href="tel:+260979450446" className={linkClass}>Call: +260 979 450 446</a></li>
            <li><a href="mailto:luskamtravelagents@gmail.com" className={linkClass}>luskamtravelagents@gmail.com</a></li>
            <li className="flex items-center gap-2 pt-1 text-white/55"><MapPin className="h-4 w-4" /> Lusaka, Zambia</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col items-start justify-between gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Luskam Travel Agents. All rights reserved.</p>
          <p>Registered travel agency · Zambia</p>
        </div>
      </div>
    </footer>
  );
};

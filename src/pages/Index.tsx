import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Services } from "@/components/Services";
import { Destinations } from "@/components/Destinations";
import { AboutSection } from "@/components/AboutSection";
import { DirectorSpotlight } from "@/components/DirectorSpotlight";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Destinations />
        <Services />
        <DirectorSpotlight />
        <AboutSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

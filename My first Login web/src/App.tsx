import './App.css'
import { ModeToggle } from './components/mode-toggle';
import { ThemeProvider } from "./components/theme-provider"
import TrueFocus from './components/TrueFocus';
import LetterGlitch from './components/LetterGlitch.tsx';
// EditableSection and ParallaxWrapper are available if needed later
// (currently not used) - keeping imports commented to avoid lint warnings.
import AnimationBuilder from './components/EditableSection';
// import ParallaxWrapper from './components/ParallaxWrapper';
import ParallaxSection from './components/ParallaxSection';

  //import { BeakerIcon } from '@heroicons/react/24/solid'
  // <BeakerIcon className=''/>
function App() {

  return (
    <>
      <AnimationBuilder/>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      {
        <>
          <nav className='absolute top-4 right-4 z-50 flex flex-col gap-2 items-end'>

            <div className="bg-gray-800 p-2 rounded-md hover:bg-gray-700 ">
              <ModeToggle/>
            </div>

          </nav>

          <div className="App h-screen w-screen overflow-hidden">

            <LetterGlitch glitchColors={ ['#2b4539', '#61dca3', '#61b3dc'] } glitchSpeed={50} centerVignette={true} outerVignette={false} smooth={true} characters='ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789'/>



              <div className='absolute top-0 left-0 w-full h-full flex justify-center items-center animate-accordion-down overflow-hidden theme-locked'>
                  <div className="w-full h-screen flex flex-col justify-center items-center">
                    <TrueFocus sentence="Mi Primer Login" manualMode={false} blurAmount={5} borderColor="crimson" animationDuration={0.4} pauseBetweenAnimations={0.9}/>
                    <br />
                    <p>Welcome to my first login web application built with React! xd</p>
                  </div>
              </div>
          </div>
        </>
      }
      </ThemeProvider>








      {/* Normal page section with scroll-driven parallax */}
      <ParallaxSection maxTranslate={70} fade={true} className="w-full">
  <section className="relative overflow-hidden py-28 bg-linear-to-b from-gray-900 via-gray-800 to-gray-900 text-white">
          {/* Background layer (moves slow) */}
          <div data-parallax-depth="0.2" className="absolute inset-0 parallax-bg pointer-events-none" aria-hidden="true"></div>

          <div className="relative z-10 flex justify-center">
            <div className="max-w-4xl px-6 text-center">
              {/* Mid layer (moves medium) */}
              <div data-parallax-depth="0.5" className="mb-6">
                <h2 className="text-3xl font-bold mb-2">Help</h2>
                <p className="mb-4 text-lg">esta es una sección de ayuda</p>
              </div>

              {/* Foreground layer (moves faster) */}
              <div data-parallax-depth="0.9" className="mb-8 flex justify-center gap-4">
                <button className="bg-white text-black px-5 py-2 rounded">SIGN IN</button>
                <button className="bg-transparent border border-white px-5 py-2 rounded">SIGN UP</button>
              </div>

              <div className="text-sm text-gray-300">Unete a nuestra comunidad · Contact: © 2023 My Login App</div>
            </div>
          </div>
        </section>
      </ParallaxSection>
    </>
  )
}

export default App

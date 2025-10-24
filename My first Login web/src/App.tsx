import './App.css'
import { ModeToggle } from './components/mode-toggle';
import { ThemeProvider } from "./components/theme-provider"
import TrueFocus from './components/TrueFocus';
import LetterGlitch from './components/LetterGlitch.tsx';

  //import { BeakerIcon } from '@heroicons/react/24/solid'
  // <BeakerIcon className=''/>
function App() {

  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {
        <>
        <nav className='bg-gray-920 p-4 h-10'>

          <ModeToggle />
          <br />

        </nav>
        <div className="App h-screen w-screen overflow-hidden">

          <LetterGlitch glitchColors={ ['#2b4539', '#61dca3', '#61b3dc'] } glitchSpeed={50} centerVignette={true} outerVignette={false} smooth={true} characters='ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789'/>

          <div className='absolute top-0 left-0 w-full h-full flex justify-center items-center'>
            <div className="bg-crimson w-full h-screen flex flex-col justify-center items-center">
              <TrueFocus sentence="Mi Primer Login" manualMode={false} blurAmount={5} borderColor="pink-500" animationDuration={0.4} pauseBetweenAnimations={1}/><br/>
              <p>Welcome to my first login web application built with React! xd</p>
            </div>
          </div>
        </div>
        </>
        }
      </ThemeProvider>
    </>
  )
}

export default App

import './App.css'
import { ModeToggle } from './components/mode-toggle';
import { ThemeProvider } from "./components/theme-provider"
import TrueFocus from './components/TrueFocus';

  //import { BeakerIcon } from '@heroicons/react/24/solid'
  // <BeakerIcon className=''/>
function App() {

  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {
        <>
        <nav className='bg-gray-800 p-4'>
          <ModeToggle />
        </nav>
          <div>
            <div className="bg-crimson w-full h-screen flex flex-col justify-center items-center">
              <TrueFocus sentence="Mi Primer Login" manualMode={true} blurAmount={5} borderColor="#d62abf" animationDuration={0.4} pauseBetweenAnimations={1}/><br/>
              <p>Welcome to my first login web application built with React! xd</p>
            </div>
          </div>
        </>
        }
      </ThemeProvider>
    </>
  )
}

export default App

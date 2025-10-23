import './App.css'
import TrueFocus from './components/TrueFocus';
import { BeakerIcon } from '@heroicons/react/24/solid'

function App() {

  return (
    <>
      <BeakerIcon className=''/>
      <div className="bg-crimson w-full h-screen flex flex-col justify-center items-center">
        <TrueFocus sentence="Mi Primer Login" manualMode={true} blurAmount={5} borderColor="red" animationDuration={0.4} pauseBetweenAnimations={1}/>
        <p>Welcome to my first login web application built with React! xd</p>
      </div>
    </>
  )
}

export default App

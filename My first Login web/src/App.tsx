import './App.css'
import TrueFocus from './components/TrueFocus';
import { BeakerIcon } from '@heroicons/react/24/solid'

function App() {

  return (
    <>
      <div className="bg-crimson w-full h-screen flex flex-col justify-center items-center">
        <h1>My First Login Web</h1> <BeakerIcon className="size-6 text-blue-500" />
        <p>Welcome to my first login web application built with React! xd</p>
        <TrueFocus sentence="True Focus" manualMode={true} blurAmount={5} borderColor="red" animationDuration={2} pauseBetweenAnimations={1}/>
      </div>
    </>
  )
}

export default App

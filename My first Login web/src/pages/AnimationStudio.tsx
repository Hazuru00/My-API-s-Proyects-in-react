import React, { useEffect } from 'react';
import AnimationBuilder from '../components/EditableSection';

const AnimationStudio: React.FC<{onClose?: ()=>void}> = ({ onClose }) => {
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => { if(e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="animation-studio fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex flex-col text-white">
      <header className="studio-header flex items-center gap-4 px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-2 py-1 bg-white/10 rounded">Close</button>
          <div className="font-bold text-lg">Animation Studio</div>
        </div>
        <nav className="ml-6 flex gap-2 text-sm opacity-90">
          <button className="px-2 py-1 rounded hover:bg-white/10">File</button>
          <button className="px-2 py-1 rounded hover:bg-white/10">Edit</button>
          <button className="px-2 py-1 rounded hover:bg-white/10">View</button>
          <button className="px-2 py-1 rounded hover:bg-white/10">Export</button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <input className="px-2 py-1 rounded text-black" placeholder="Buscar..." />
        </div>
      </header>

      <div className="studio-body flex-1 flex overflow-hidden">
        <aside className="studio-sidebar w-64 bg-white/5 p-3 border-r border-white/10">
          <div className="mb-3 font-semibold">Project</div>
          <div className="text-sm">Files · Layers · Assets</div>
        </aside>

        <main className="studio-main flex-1 p-4 overflow-auto">
          {/* Embed the builder in embedded mode */}
          <AnimationBuilder mode="embedded" />
        </main>

        <aside className="studio-right w-80 bg-white/5 p-3 border-l border-white/10">
          <div className="font-semibold mb-2">Inspector</div>
          <div className="text-sm">Propiedades de la capa seleccionada</div>
        </aside>
      </div>
    </div>
  );
};

export default AnimationStudio;

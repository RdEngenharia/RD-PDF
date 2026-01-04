

import React, { useState } from 'react';
import PdfMerger from './components/PdfMerger';
import ImageToPdf from './components/ImageToPdf';
import PdfCompressor from './components/PdfCompressor';
import PdfSplitter from './components/PdfSplitter';
import PdfEditor from './components/PdfEditor';
import ImageAnnotator from './components/ImageAnnotator';
import { MergeIcon, ImageIcon, CompressIcon, SplitIcon, EditIcon, AnnotateIcon } from './components/Icons';

type Tool = 'merge' | 'image' | 'compress' | 'split' | 'edit' | 'annotate';

const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<Tool>('merge');

  const renderTool = () => {
    switch (activeTool) {
      case 'merge':
        return <PdfMerger />;
      case 'split':
        return <PdfSplitter />;
      case 'compress':
        return <PdfCompressor />;
      case 'edit':
        return <PdfEditor />;
      case 'image':
        return <ImageToPdf />;
      case 'annotate':
        return <ImageAnnotator />;
      default:
        return <PdfMerger />;
    }
  };

  // FIX: The error on line 44 was misleading. The actual issue was with `React.cloneElement` below.
  // The type of the `icon` prop was too generic (`React.ReactElement`), causing TypeScript to fail when trying to add a `className` prop.
  // I have corrected the type definition for the `icon` prop in the component's signature to `React.ReactElement<{ className?: string }>`.
  const ToolButton = ({ tool, label, icon }: { tool: Tool; label: string; icon: React.ReactElement<{ className?: string }> }) => (
    <button
      onClick={() => setActiveTool(tool)}
      className={`p-2 md:p-3 rounded-lg font-semibold transition-all duration-300 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 text-center ${
        activeTool === tool
          ? 'bg-indigo-600 text-white shadow-lg'
          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
      }`}
    >
      {React.cloneElement(icon, { className: 'w-6 h-6 md:w-5 md:h-5' })}
      <span className="text-xs md:text-sm leading-tight">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col items-center p-4">
      <header className="w-full max-w-5xl mx-auto text-center my-8">
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
          RD PDF
        </h1>
        <p className="text-slate-400 mt-2">Ferramentas PDF Offline & Seguras</p>
      </header>

      <main className="w-full max-w-5xl mx-auto flex-grow flex flex-col">
        <div className="bg-slate-800 p-2 rounded-xl shadow-md mb-8">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <ToolButton tool="merge" label="Juntar PDFs" icon={<MergeIcon />} />
            <ToolButton tool="split" label="Dividir PDF" icon={<SplitIcon />} />
            <ToolButton tool="compress" label="Comprimir PDF" icon={<CompressIcon />} />
            <ToolButton tool="edit" label="Editar PDF" icon={<EditIcon />} />
            <ToolButton tool="image" label="Imagem para PDF" icon={<ImageIcon />} />
            <ToolButton tool="annotate" label="Anotar Imagem" icon={<AnnotateIcon />} />
          </div>
        </div>

        <div className="flex-grow">
          {renderTool()}
        </div>
      </main>
      
      <footer className="w-full max-w-5xl mx-auto text-center py-6 mt-8">
        <p className="text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} RD PDF. Construído pela RD Engenharia. Processamento seguro no seu navegador.
        </p>
      </footer>
    </div>
  );
};

export default App;
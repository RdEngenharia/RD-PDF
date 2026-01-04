
import React, { useState, useCallback, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import { FileIcon, TrashIcon, UploadIcon, SpinnerIcon, DownloadIcon } from './Icons';

// Configuração do worker para pdf.js no ambiente Vite/módulos
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type PdfFile = {
  file: File;
  previewUrl: string;
};

const PdfMerger: React.FC = () => {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const draggedItemIndex = useRef<number | null>(null);
  const draggedOverItemIndex = useRef<number | null>(null);

  const generatePreview = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); // Get the first page
      const viewport = page.getViewport({ scale: 0.4 });
      const canvas = document.createElement('canvas');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');
      // FIX: The RenderParameters object for `page.render` expects a `canvasContext` property.
      // The previous code was causing a type error due to a mismatch in the expected structure.
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      return canvas.toDataURL();
    } catch (e) {
        console.error("Failed to generate preview for", file.name, e);
        return ""; 
    }
  };
  
  const processFiles = async (files: FileList | null) => {
    if (files) {
        const newFiles = Array.from(files).filter(file => file.type === 'application/pdf');
        if (newFiles.length !== files.length) {
            setError('Apenas arquivos PDF são aceitos.');
        } else {
            setError(null);
        }
      
        setIsLoading(true);
        const newPdfFiles: PdfFile[] = [];
        for (const file of newFiles) {
            const previewUrl = await generatePreview(file);
            newPdfFiles.push({ file, previewUrl });
        }
        setPdfFiles(prevFiles => [...prevFiles, ...newPdfFiles]);
        setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  const removeFile = (index: number) => {
    setPdfFiles(pdfFiles.filter((_, i) => i !== index));
  };

  const handleDragSort = () => {
    if (draggedItemIndex.current === null || draggedOverItemIndex.current === null) return;
    const items = [...pdfFiles];
    const draggedItem = items.splice(draggedItemIndex.current, 1)[0];
    items.splice(draggedOverItemIndex.current, 0, draggedItem);
    draggedItemIndex.current = null;
    draggedOverItemIndex.current = null;
    setPdfFiles(items);
  };
  
  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, action: 'enter' | 'leave' | 'over' | 'drop') => {
    e.preventDefault();
    e.stopPropagation();
    if (action === 'enter' || action === 'over') {
      setIsDragging(true);
    } else if (action === 'leave') {
      setIsDragging(false);
    } else if (action === 'drop') {
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    }
  };

  const mergePdfs = useCallback(async () => {
    if (pdfFiles.length < 2) {
      setError('Por favor, selecione pelo menos dois arquivos PDF para juntar.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const { file } of pdfFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
    } catch (e) {
      console.error(e);
      setError('Ocorreu um erro ao juntar os PDFs. Por favor, verifique se são arquivos PDF válidos.');
    } finally {
      setIsLoading(false);
    }
  }, [pdfFiles]);

  return (
    <div 
        className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in"
        onDragEnter={(e) => handleDragEvents(e, 'enter')}
        onDragLeave={(e) => handleDragEvents(e, 'leave')}
        onDragOver={(e) => handleDragEvents(e, 'over')}
        onDrop={(e) => handleDragEvents(e, 'drop')}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 pointer-events-none">
          <div className="text-center">
            <UploadIcon className="mx-auto w-16 h-16 text-indigo-400" />
            <p className="mt-4 text-lg font-semibold text-slate-200">Solte os PDFs aqui</p>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center">
        {pdfFiles.length === 0 && (
          <>
            <label htmlFor="pdf-upload" className="w-full cursor-pointer">
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300">
                <UploadIcon className="mx-auto" />
                <p className="mt-2 text-slate-300">
                  <span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste e solte os PDFs
                </p>
                <p className="text-xs text-slate-500">Todo o processamento é feito no seu navegador</p>
              </div>
            </label>
            <input id="pdf-upload" type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
          </>
        )}

        {pdfFiles.length > 0 && (
          <div className="w-full">
            <h3 className="font-semibold mb-4 text-slate-300">Arquivos Selecionados ({pdfFiles.length}) - Arraste para reordenar:</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {pdfFiles.map(({ file, previewUrl }, index) => (
                <div
                  key={file.name + index}
                  className="relative group bg-slate-700 p-2 rounded-lg cursor-grab transition-all duration-300"
                  draggable
                  onDragStart={() => (draggedItemIndex.current = index)}
                  onDragEnter={() => (draggedOverItemIndex.current = index)}
                  onDragEnd={handleDragSort}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <button onClick={() => removeFile(index)} className="absolute top-1 right-1 z-10 p-1 bg-slate-800/50 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                  <div className="w-full aspect-[2/3] bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                    {previewUrl ? (
                      <img src={previewUrl} alt={file.name} className="object-contain w-full h-full" />
                    ) : (
                      <FileIcon className="w-8 h-8 text-slate-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-300 truncate mt-2">{file.name}</p>
                </div>
              ))}
               <label htmlFor="pdf-upload-add" className="cursor-pointer w-full aspect-[2/3]">
                <div className="border-2 border-dashed border-slate-600 rounded-lg h-full text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  <span className="text-xs mt-1">Adicionar</span>
                </div>
              </label>
              <input id="pdf-upload-add" type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}
        
        {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}

        <button
          onClick={mergePdfs}
          disabled={isLoading || pdfFiles.length < 2}
          className="w-full md:w-auto mt-8 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <SpinnerIcon />
              {pdfFiles.length > 0 ? 'Juntando...' : 'Carregando...'}
            </>
          ) : (
            <>
              <DownloadIcon />
              Juntar e Baixar
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PdfMerger;

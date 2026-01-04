
import React, { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import { UploadIcon, SpinnerIcon, DownloadIcon } from './Icons';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type PageThumbnail = {
    dataUrl: string;
    pageNumber: number;
};

const PdfSplitter: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pageThumbnails, setPageThumbnails] = useState<PageThumbnail[]>([]);
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const resetState = () => {
        setPdfFile(null);
        setPageThumbnails([]);
        setSelectedPages(new Set());
        setError(null);
        setIsLoading(false);
        setTotalPages(0);
    };

    const renderPdfPages = useCallback(async (file: File) => {
        setIsLoading(true);
        setError(null);
        setPageThumbnails([]);
        setSelectedPages(new Set());
        setTotalPages(0);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
            const pdf = await loadingTask.promise;
            setTotalPages(pdf.numPages);
            
            const thumbnails: PageThumbnail[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.5 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                const context = canvas.getContext('2d');
                if (!context) continue;

                // FIX: The RenderParameters object for `page.render` expects a `canvasContext` property.
                // The previous code was causing a type error due to a mismatch in the expected structure.
                const renderContext = { canvasContext: context, viewport: viewport };
                await page.render(renderContext).promise;
                thumbnails.push({ dataUrl: canvas.toDataURL(), pageNumber: i });
            }
            setPageThumbnails(thumbnails);
        } catch (e) {
            console.error(e);
            setError('Falha ao ler o PDF. O arquivo pode estar corrompido ou ter um formato inválido.');
            resetState();
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const processFile = (file: File | null) => {
        if (file) {
            if (file.type === 'application/pdf') {
                setPdfFile(file);
                renderPdfPages(file);
            } else {
                setError('Por favor, selecione um arquivo PDF.');
                resetState();
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        processFile(e.target.files?.[0] || null);
    };

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, action: 'enter' | 'leave' | 'over' | 'drop') => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'enter' || action === 'over') {
          setIsDragging(true);
        } else if (action === 'leave' || action === 'drop') {
          setIsDragging(false);
          if (action === 'drop') {
            processFile(e.dataTransfer.files?.[0] || null);
          }
        }
    };

    const togglePageSelection = (pageNumber: number) => {
        const newSelection = new Set(selectedPages);
        if (newSelection.has(pageNumber)) {
            newSelection.delete(pageNumber);
        } else {
            newSelection.add(pageNumber);
        }
        setSelectedPages(newSelection);
    };

    const selectAllPages = () => {
        const allPageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
        setSelectedPages(new Set(allPageNumbers));
    };

    const clearSelection = () => {
        setSelectedPages(new Set());
    };

    const splitPdf = useCallback(async () => {
        if (!pdfFile || selectedPages.size === 0) {
            setError('Por favor, selecione pelo menos uma página para extrair.');
            return;
        }
        setError(null);
        setIsLoading(true);

        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);

            const newPdf = await PDFDocument.create();
            const sortedPageIndices = Array.from(selectedPages).sort((a, b) => a - b).map(n => n - 1);
            
            const copiedPages = await newPdf.copyPages(pdfDoc, sortedPageIndices);
            copiedPages.forEach(page => newPdf.addPage(page));

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            saveAs(blob, `rd-pdf-dividido.pdf`);
        } catch (e) {
            console.error(e);
            setError('Ocorreu um erro ao dividir o PDF.');
        } finally {
            setIsLoading(false);
        }
    }, [pdfFile, selectedPages]);

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
                        <p className="mt-4 text-lg font-semibold text-slate-200">Solte o PDF aqui</p>
                    </div>
                </div>
            )}
            {!pdfFile && (
                <div className="flex flex-col items-center">
                    <label htmlFor="pdf-split-upload" className="w-full cursor-pointer">
                        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300">
                            <UploadIcon className="mx-auto" />
                            <p className="mt-2 text-slate-300">
                                <span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste e solte um PDF
                            </p>
                            <p className="text-xs text-slate-500">Selecione páginas para extrair</p>
                        </div>
                    </label>
                    <input id="pdf-split-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                </div>
            )}

            {pdfFile && isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                    <SpinnerIcon />
                    <p className="mt-4 text-slate-300">Lendo as páginas do PDF...</p>
                    <p className="text-sm text-slate-500">{pageThumbnails.length} de {totalPages} páginas carregadas</p>
                </div>
            )}

            {pdfFile && !isLoading && pageThumbnails.length > 0 && (
                <div>
                    <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
                        <div>
                            <h3 className="font-semibold text-slate-200">Selecione as Páginas para Extrair</h3>
                            <p className="text-sm text-slate-400">{selectedPages.size} de {totalPages} páginas selecionadas.</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={selectAllPages} className="px-3 py-1 bg-slate-600 text-xs font-semibold rounded-md hover:bg-slate-500 transition-colors">Selecionar Tudo</button>
                             <button onClick={clearSelection} className="px-3 py-1 bg-slate-600 text-xs font-semibold rounded-md hover:bg-slate-500 transition-colors">Limpar</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 max-h-[50vh] overflow-y-auto p-2 bg-slate-900/50 rounded-lg">
                        {pageThumbnails.map(({ dataUrl, pageNumber }) => (
                            <button key={pageNumber} onClick={() => togglePageSelection(pageNumber)} className={`relative rounded-md overflow-hidden border-4 transition-all duration-200 ${selectedPages.has(pageNumber) ? 'border-indigo-500' : 'border-transparent hover:border-slate-500'}`}>
                                <img src={dataUrl} alt={`Página ${pageNumber}`} className="w-full h-auto block" />
                                <div className="absolute top-1 right-1 bg-slate-800 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{pageNumber}</div>
                                {selectedPages.has(pageNumber) && (
                                    <div className="absolute inset-0 bg-indigo-500/50 flex items-center justify-center">
                                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col items-center mt-6">
                        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
                        <button
                            onClick={splitPdf}
                            disabled={selectedPages.size === 0}
                            className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
                        >
                            <DownloadIcon />
                            Extrair e Baixar ({selectedPages.size})
                        </button>
                    </div>
                </div>
            )}
            
            {error && !isLoading && <p className="text-red-400 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default PdfSplitter;

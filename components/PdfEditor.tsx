
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import { UploadIcon, SpinnerIcon, DownloadIcon, TypeIcon, TrashIcon, RotateLeftIcon } from './Icons';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PageThumbnail {
    id: number; // Original page number, stable ID
    dataUrl: string;
    width: number;
    height: number;
    rotation: number; // 0, 90, 180, 270
}

interface TextElement {
    id: string;
    pageNumber: number; // Original page number
    x: number; // percentage
    y: number; // percentage
    text: string;
    fontSize: number; // pt
    isEditing: boolean;
}

const PdfEditor: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pageThumbnails, setPageThumbnails] = useState<PageThumbnail[]>([]);
    const [activePage, setActivePage] = useState<PageThumbnail | null>(null);
    const [textElements, setTextElements] = useState<TextElement[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isAddingText, setIsAddingText] = useState(false);
    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    
    const editorPanelRef = useRef<HTMLDivElement>(null);
    const draggedItemIndex = useRef<number | null>(null);
    const draggedOverItemIndex = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingTextId || !editorPanelRef.current) return;

            const panelRect = editorPanelRef.current.getBoundingClientRect();
            
            const newXPercent = ((e.clientX - panelRect.left) / panelRect.width) * 100;
            const newYPercent = ((e.clientY - panelRect.top) / panelRect.height) * 100;

            const clampedX = Math.max(0, Math.min(100, newXPercent));
            const clampedY = Math.max(0, Math.min(100, newYPercent));
            
            setTextElements(prev =>
                prev.map(el =>
                    el.id === draggingTextId ? { ...el, x: clampedX, y: clampedY } : el
                )
            );
        };

        const handleMouseUp = () => {
            setDraggingTextId(null);
        };

        if (draggingTextId) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingTextId]);


    const resetState = () => {
        setPdfFile(null);
        setPageThumbnails([]);
        setActivePage(null);
        setTextElements([]);
        setError(null);
        setIsLoading(false);
        setIsAddingText(false);
    };

    const renderPdfPages = useCallback(async (file: File) => {
        setIsLoading(true);
        resetState();
        setPdfFile(file);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            
            const thumbnails: PageThumbnail[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                const context = canvas.getContext('2d');
                if (!context) continue;

                await page.render({ canvas, canvasContext: context, viewport: viewport }).promise;
                thumbnails.push({ id: i, dataUrl: canvas.toDataURL(), width: viewport.width, height: viewport.height, rotation: 0 });
            }
            setPageThumbnails(thumbnails);
            setActivePage(thumbnails[0] || null);
        } catch (e) {
            console.error(e);
            setError('Falha ao ler o PDF.');
            resetState();
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const processFile = (file: File | null) => {
        if (file) {
            if (file.type === 'application/pdf') {
                renderPdfPages(file);
            } else {
                setError('Por favor, selecione um arquivo PDF.');
                resetState();
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => processFile(e.target.files?.[0] || null);

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, action: 'enter' | 'leave' | 'over' | 'drop') => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'enter' || action === 'over') setIsDragging(true);
        else if (action === 'leave' || action === 'drop') {
            setIsDragging(false);
            if (action === 'drop') processFile(e.dataTransfer.files?.[0] || null);
        }
    };

    const handleAddTextClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAddingText || !editorPanelRef.current || !activePage) return;
        const rect = editorPanelRef.current.getBoundingClientRect();
        const newText: TextElement = {
            id: `text-${Date.now()}`,
            pageNumber: activePage.id,
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
            text: 'Texto aqui',
            fontSize: 12,
            isEditing: true,
        };
        setTextElements(prev => [...prev, newText]);
        setIsAddingText(false);
    };
    
    const updateTextElement = (id: string, newText: string) => setTextElements(prev => prev.map(el => el.id === id ? { ...el, text: newText } : el));
    const deleteTextElement = (id: string) => setTextElements(prev => prev.filter(el => el.id !== id));

    const handleTextDragStart = (e: React.MouseEvent, id: string) => {
        const target = e.target as HTMLElement;
        if (target.tagName.toLowerCase() === 'textarea' || target.closest('button')) {
            return;
        }
        e.preventDefault();
        setDraggingTextId(id);
    };
    
    const handleDragSort = () => {
        if (draggedItemIndex.current === null || draggedOverItemIndex.current === null) return;
        const items = [...pageThumbnails];
        const [reorderedItem] = items.splice(draggedItemIndex.current, 1);
        items.splice(draggedOverItemIndex.current, 0, reorderedItem);
        draggedItemIndex.current = null;
        draggedOverItemIndex.current = null;
        setPageThumbnails(items);
    };

    const rotatePage = (pageId: number) => {
        setPageThumbnails(prev => prev.map(p => p.id === pageId ? { ...p, rotation: (p.rotation + 90) % 360 } : p));
        setActivePage(prev => (prev?.id === pageId ? { ...prev, rotation: (prev.rotation + 90) % 360 } : prev));
    };

    const deletePage = (pageId: number) => {
        setPageThumbnails(prev => {
            const newPages = prev.filter(p => p.id !== pageId);
            if (activePage?.id === pageId) {
                const currentIndex = prev.findIndex(p => p.id === pageId);
                const nextIndex = currentIndex >= newPages.length ? newPages.length - 1 : currentIndex;
                setActivePage(newPages[nextIndex] || null);
            }
            return newPages;
        });
        setTextElements(prev => prev.filter(t => t.pageNumber !== pageId));
    };

    const savePdf = useCallback(async () => {
        if (!pdfFile || pageThumbnails.length === 0) return;
        setIsLoading(true);
        try {
            const existingPdfBytes = await pdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const newPdfDoc = await PDFDocument.create();
            const helveticaFont = await newPdfDoc.embedFont(StandardFonts.Helvetica);

            const pageIndicesToCopy = pageThumbnails.map(p => p.id - 1);
            const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndicesToCopy);
            copiedPages.forEach(page => newPdfDoc.addPage(page));

            const newPages = newPdfDoc.getPages();
            for (let i = 0; i < newPages.length; i++) {
                const page = newPages[i];
                const thumbnail = pageThumbnails[i];
                page.setRotation(degrees(thumbnail.rotation));
                const textsForThisPage = textElements.filter(t => t.pageNumber === thumbnail.id);
                for (const textEl of textsForThisPage) {
                    const { width, height } = page.getSize();
                    page.drawText(textEl.text, {
                        x: (textEl.x / 100) * width,
                        y: height - (textEl.y / 100) * height, // Position from top-left
                        font: helveticaFont,
                        size: textEl.fontSize,
                        color: rgb(0, 0, 0),
                    });
                }
            }
            
            const pdfBytes = await newPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, `rd-pdf-editado.pdf`);
        } catch (e) {
            console.error(e);
            setError("Ocorreu um erro ao salvar o PDF.");
        } finally {
            setIsLoading(false);
        }
    }, [pdfFile, pageThumbnails, textElements]);

    return (
        <div 
            className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in"
            onDragEnter={(e) => handleDragEvents(e, 'enter')} onDragLeave={(e) => handleDragEvents(e, 'leave')} onDragOver={(e) => handleDragEvents(e, 'over')} onDrop={(e) => handleDragEvents(e, 'drop')}
        >
            {isDragging && (<div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 pointer-events-none"><div className="text-center"><UploadIcon className="mx-auto w-16 h-16 text-indigo-400" /><p className="mt-4 text-lg font-semibold text-slate-200">Solte o PDF aqui</p></div></div>)}
            {!pdfFile ? (
                <div className="flex flex-col items-center">
                    <label htmlFor="pdf-edit-upload" className="w-full cursor-pointer"><div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300">
                        <UploadIcon className="mx-auto" /><p className="mt-2 text-slate-300"><span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste e solte um PDF</p><p className="text-xs text-slate-500">Adicione texto, reordene, rotacione e delete páginas</p>
                    </div></label>
                    <input id="pdf-edit-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                </div>
            ) : isLoading ? (<div className="flex flex-col items-center justify-center min-h-[300px]"><SpinnerIcon /><p className="mt-4 text-slate-300">Lendo seu PDF...</p></div>) 
            : (
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="lg:w-1/4 xl:w-1/5 space-y-4">
                        <div className="flex gap-2">
                            <button onClick={() => setIsAddingText(true)} className={`w-full flex items-center justify-center gap-2 p-2 rounded-md transition-colors text-sm font-semibold ${isAddingText ? 'bg-indigo-600' : 'bg-slate-600 hover:bg-slate-500'}`}><TypeIcon className="w-4 h-4"/> Adicionar Texto</button>
                        </div>
                         <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                            {pageThumbnails.map((thumb, index) => (
                                <div key={thumb.id} draggable onDragStart={() => (draggedItemIndex.current = index)} onDragEnter={() => (draggedOverItemIndex.current = index)} onDragEnd={handleDragSort} onDragOver={(e) => e.preventDefault()}
                                    className={`relative group rounded-md overflow-hidden border-2 transition-all cursor-grab ${activePage?.id === thumb.id ? 'border-indigo-500' : 'border-transparent'}`}>
                                    <button onClick={() => setActivePage(thumb)} className="w-full h-full">
                                        <img src={thumb.dataUrl} alt={`Página ${thumb.id}`} style={{ transform: `rotate(${thumb.rotation}deg)` }} className="w-full h-auto block bg-white transition-transform" />
                                    </button>
                                    <div className="absolute top-0 right-0 flex flex-col p-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <button onClick={() => rotatePage(thumb.id)} className="p-1 bg-slate-800/70 rounded-full text-white hover:bg-indigo-600"><RotateLeftIcon className="w-4 h-4"/></button>
                                        <button onClick={() => deletePage(thumb.id)} className="p-1 bg-slate-800/70 rounded-full text-white hover:bg-red-600"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                    <div className="absolute bottom-1 left-1 bg-slate-800/70 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold pointer-events-none">{index + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex-grow lg:w-3/4 xl:w-4/5 bg-slate-900/50 rounded-lg flex items-center justify-center p-4 min-h-[50vh]">
                        <div ref={editorPanelRef} className={`relative select-none transition-all duration-300 ${isAddingText ? 'cursor-crosshair' : ''}`} onClick={handleAddTextClick}>
                            {activePage && <img src={activePage.dataUrl} style={{ transform: `rotate(${activePage.rotation}deg)`}} className="max-w-full max-h-[80vh] object-contain shadow-lg" />}
                            {textElements.filter(el => el.pageNumber === activePage?.id).map(el => (
                                <div key={el.id} style={{ left: `${el.x}%`, top: `${el.y}%`, transform: 'translate(-50%, -50%)' }} 
                                    className={`absolute group p-2 ${draggingTextId === el.id ? 'cursor-grabbing z-20' : 'cursor-grab'}`}
                                    onMouseDown={(e) => handleTextDragStart(e, el.id)}>
                                    <textarea value={el.text} onChange={(e) => updateTextElement(el.id, e.target.value)} onBlur={() => setTextElements(p => p.map(t => ({...t, isEditing: false})))} autoFocus
                                        className="bg-transparent border border-dashed border-indigo-500 text-white p-1 resize-none focus:outline-none cursor-text" style={{ fontSize: `${el.fontSize}px`, lineHeight: 1.1 }}
                                    />
                                    <button onClick={(e) => {e.stopPropagation(); deleteTextElement(el.id)}} className="absolute -top-3 -right-3 p-0.5 bg-slate-800 rounded-full text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-3 h-3"/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
             <div className="flex flex-col items-center mt-6">
                 {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
                 {pdfFile && !isLoading && pageThumbnails.length > 0 && (
                    <button onClick={savePdf} disabled={isLoading} className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-slate-600 flex items-center justify-center gap-2">
                       {isLoading ? <><SpinnerIcon/> Salvando...</> : <><DownloadIcon/> Salvar PDF Modificado</>}
                    </button>
                 )}
             </div>
        </div>
    );
};

export default PdfEditor;

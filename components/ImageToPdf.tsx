import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { UploadIcon, SpinnerIcon, DownloadIcon, RotateLeftIcon, RotateRightIcon, MagicWandIcon, EraserIcon, TrashIcon, ScissorsIcon } from './Icons';
import { removeBackground } from '@imgly/background-removal';

type PageSize = 'A4' | 'Letter';
type Orientation = 'portrait' | 'landscape';
type ImageFilter = 'none' | 'grayscale' | 'document';
type EraserMode = 'brush' | 'cutout';

interface ImagePage {
    id: string;
    file: File;
    previewUrl: string;
    originalUrl: string; 
    rotation: number;
    filter: ImageFilter;
    bgRemoved: boolean;
}

const PAGE_SIZES: Record<PageSize, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
};

const FILTER_CLASSES: Record<ImageFilter, string> = {
    none: '',
    grayscale: 'grayscale',
    document: 'grayscale contrast-[200%] brightness-[140%]',
};

function dataURLtoFile(dataurl: string, filename: string): File {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Could not find mime type in data url");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

// Helper to apply visual transformations (like rotation) to an image before PDF generation
const getProcessedImage = (page: ImagePage): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (page.rotation === 0) {
            resolve(page.previewUrl);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            const radians = page.rotation * (Math.PI / 180);
            const isSideways = page.rotation === 90 || page.rotation === 270;

            canvas.width = isSideways ? img.height : img.width;
            canvas.height = isSideways ? img.width : img.height;
            
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(radians);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
            reject(new Error('Failed to load image for processing'));
        };
        img.src = page.previewUrl;
    });
};


const ImageToPdf: React.FC = () => {
    const [pages, setPages] = useState<ImagePage[]>([]);
    const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiProgress, setAiProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // Editor states
    const [isErasing, setIsErasing] = useState(false);
    const [isApplyingEdit, setIsApplyingEdit] = useState(false);
    const [eraserSize, setEraserSize] = useState(30);
    const [eraserMode, setEraserMode] = useState<EraserMode>('brush');
    const [cutoutPoints, setCutoutPoints] = useState<{x: number, y: number}[]>([]);
    const [eraserCursorPos, setEraserCursorPos] = useState<{ x: number; y: number } | null>(null);
    const eraserCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingEraser = useRef(false);

    const draggedItemIndex = useRef<number | null>(null);
    const draggedOverItemIndex = useRef<number | null>(null);

    const [pageSize, setPageSize] = useState<PageSize>('A4');
    const [orientation, setOrientation] = useState<Orientation>('portrait');
    
    const activePage = activePageIndex !== null ? pages[activePageIndex] : null;

    // Redraw canvas for eraser and cutout tool
    useEffect(() => {
        if (isErasing && activePage && eraserCanvasRef.current) {
            const canvas = eraserCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);

                if (eraserMode === 'cutout' && cutoutPoints.length > 0) {
                    ctx.strokeStyle = '#00f6ff';
                    ctx.fillStyle = '#00f6ff';
                    ctx.lineWidth = 2;
                    // Draw points
                    cutoutPoints.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                        ctx.fill();
                    });
                    // Draw lines
                    ctx.beginPath();
                    ctx.moveTo(cutoutPoints[0].x, cutoutPoints[0].y);
                    for (let i = 1; i < cutoutPoints.length; i++) {
                        ctx.lineTo(cutoutPoints[i].x, cutoutPoints[i].y);
                    }
                    ctx.stroke();
                }
            };
            img.src = activePage.previewUrl;
        }
    }, [isErasing, activePage, eraserMode, cutoutPoints]);

    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = eraserCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if(eraserMode === 'brush') {
            isDrawingEraser.current = true;
            drawEraserBrush(x, y);
        } else if (eraserMode === 'cutout') {
            setCutoutPoints(prev => [...prev, {x, y}]);
        }
    };
    const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingEraser.current || eraserMode !== 'brush') return;
        const canvas = eraserCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        drawEraserBrush(x, y);
    };
    const handleCanvasPointerUp = () => {
        isDrawingEraser.current = false;
        const ctx = eraserCanvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
        }
    };
    const drawEraserBrush = (x: number, y: number) => {
        const canvas = eraserCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, eraserSize, 0, Math.PI * 2, false);
        ctx.fill();
    };

    const handleApplyEraser = () => {
        const canvas = eraserCanvasRef.current;
        if (!canvas || !activePage) return;

        const performSave = () => {
            const dataUrl = canvas.toDataURL('image/png');
            const newFile = dataURLtoFile(dataUrl, `edited_${activePage.file.name}`);
            updateActivePage({ previewUrl: dataUrl, file: newFile });
            setIsErasing(false);
            setEraserCursorPos(null);
            setCutoutPoints([]);
            setIsApplyingEdit(false);
        }

        setIsApplyingEdit(true);

        if (eraserMode === 'cutout') {
            const ctx = canvas.getContext('2d');
            if (!ctx || cutoutPoints.length < 3) {
                setError("Por favor, selecione pelo menos 3 pontos para o recorte.");
                setIsApplyingEdit(false);
                return;
            }
            setError(null);

            const originalImage = new Image();
            originalImage.crossOrigin = "anonymous";
            originalImage.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(cutoutPoints[0].x, cutoutPoints[0].y);
                for (let i = 1; i < cutoutPoints.length; i++) {
                    ctx.lineTo(cutoutPoints[i].x, cutoutPoints[i].y);
                }
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(originalImage, 0, 0);
                ctx.restore();
                
                performSave();
            };
            originalImage.onerror = () => {
                setError("Não foi possível carregar a imagem para aplicar o recorte.");
                setIsApplyingEdit(false);
            }
            originalImage.src = activePage.previewUrl;
        } else { // brush mode
            performSave();
        }
    };
    
    const handleCancelEraser = () => {
        setIsErasing(false);
        setEraserCursorPos(null);
        setCutoutPoints([]);
    };

    const handleEditorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isErasing) {
            const rect = e.currentTarget.getBoundingClientRect();
            setEraserCursorPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    };

    const handleEditorPointerLeave = () => {
        if (isErasing) {
            setEraserCursorPos(null);
        }
    };

    const processFiles = (files: FileList | null) => {
        if (!files) return;
        const newImageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (newImageFiles.length !== files.length) {
            setError('Apenas arquivos de imagem são aceitos.');
        } else {
            setError(null);
        }

        const newPages: ImagePage[] = newImageFiles.map(file => {
            const url = URL.createObjectURL(file);
            return {
                id: `${file.name}-${Date.now()}`,
                file,
                previewUrl: url,
                originalUrl: url,
                rotation: 0,
                filter: 'none',
                bgRemoved: false,
            };
        });
        
        setPages(prev => [...prev, ...newPages]);
        if (activePageIndex === null) {
            setActivePageIndex(0);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        processFiles(e.target.files);
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
    
    const updateActivePage = (updates: Partial<ImagePage>) => {
        if (activePageIndex === null) return;
        setPages(pages.map((page, index) => 
            index === activePageIndex ? { ...page, ...updates } : page
        ));
    };

    const convertToPdf = useCallback(async () => {
        if (pages.length === 0) {
            setError('Adicione pelo menos uma imagem.');
            return;
        }
        setError(null);
        setIsLoading(true);

        try {
            const pdfDoc = await PDFDocument.create();
            
            for (const pageData of pages) {
                const processedImageUrl = await getProcessedImage(pageData);
                const imgBytes = await fetch(processedImageUrl).then(res => res.arrayBuffer());

                const image = processedImageUrl.startsWith('data:image/png')
                    ? await pdfDoc.embedPng(imgBytes)
                    : await pdfDoc.embedJpg(imgBytes);

                let pageDimensions = PAGE_SIZES[pageSize];
                if (orientation === 'landscape') pageDimensions = [pageDimensions[1], pageDimensions[0]];

                const page = pdfDoc.addPage(pageDimensions);
                const { width: pageWidth, height: pageHeight } = page.getSize();
                
                const margin = 36;
                const contentWidth = pageWidth - margin * 2;
                const contentHeight = pageHeight - margin * 2;
                
                const imageAspectRatio = image.width / image.height;
                let finalWidth = contentWidth;
                let finalHeight = contentWidth / imageAspectRatio;

                if (finalHeight > contentHeight) {
                    finalHeight = contentHeight;
                    finalWidth = contentHeight * imageAspectRatio;
                }
                
                page.drawImage(image, {
                    x: (pageWidth - finalWidth) / 2,
                    y: (pageHeight - finalHeight) / 2,
                    width: finalWidth,
                    height: finalHeight,
                    rotate: degrees(0), // Rotation is now pre-applied to the image
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, 'rd-pdf-documento.pdf');

        } catch (e) {
            console.error(e);
            setError('Ocorreu um erro durante a conversão.');
        } finally {
            setIsLoading(false);
        }
    }, [pages, pageSize, orientation]);

    const handleRemoveBackground = async () => {
        if (!activePage) return;
        setIsAiLoading(true);
        setAiProgress('Iniciando...');
        setError(null);
        try {
            const resultBlob = await removeBackground(activePage.file, {
                progress: (key, current, total) => {
                    const progress = Math.round((current / total) * 100);
                    if (key.startsWith('download')) { setAiProgress(`Baixando modelo... ${progress}%`); } 
                    else if (key.startsWith('compute')) { setAiProgress('Processando imagem...'); }
                }
            });
            const newPreviewUrl = URL.createObjectURL(resultBlob);
            const newFile = new File([resultBlob], "bg_removed_" + activePage.file.name, {type: resultBlob.type});
            updateActivePage({ previewUrl: newPreviewUrl, originalUrl: newPreviewUrl, file: newFile, bgRemoved: true, filter: 'none' });
        } catch(e) {
            console.error(e);
            setError('Erro ao remover o fundo da imagem.');
        } finally {
            setIsAiLoading(false);
            setAiProgress('');
        }
    };
    
    const removePage = (indexToRemove: number) => {
        setPages(prev => prev.filter((_, index) => index !== indexToRemove));
        if (activePageIndex === indexToRemove) {
            setActivePageIndex(pages.length > 1 ? 0 : null);
        } else if (activePageIndex !== null && activePageIndex > indexToRemove) {
            setActivePageIndex(activePageIndex - 1);
        }
    };

    const handleDragSort = () => {
        if (draggedItemIndex.current === null || draggedOverItemIndex.current === null || activePageIndex === null) return;
        const items = [...pages];
        const draggedItem = items.splice(draggedItemIndex.current, 1)[0];
        items.splice(draggedOverItemIndex.current, 0, draggedItem);
        
        if (activePageIndex === draggedItemIndex.current) {
            setActivePageIndex(draggedOverItemIndex.current);
        } else {
            if (draggedItemIndex.current < activePageIndex && draggedOverItemIndex.current >= activePageIndex) {
                setActivePageIndex(activePageIndex - 1);
            } else if (draggedItemIndex.current > activePageIndex && draggedOverItemIndex.current <= activePageIndex) {
                setActivePageIndex(activePageIndex + 1);
            }
        }
        draggedItemIndex.current = null;
        draggedOverItemIndex.current = null;
        setPages(items);
    };

    return (
        <div 
            className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in"
            onDragEnter={(e) => handleDragEvents(e, 'enter')} onDragLeave={(e) => handleDragEvents(e, 'leave')} onDragOver={(e) => handleDragEvents(e, 'over')} onDrop={(e) => handleDragEvents(e, 'drop')}
        >
             {isDragging && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 pointer-events-none">
                    <div className="text-center"><UploadIcon className="mx-auto w-16 h-16 text-indigo-400" /><p className="mt-4 text-lg font-semibold text-slate-200">Solte as imagens aqui</p></div>
                </div>
            )}
            {pages.length === 0 ? (
                <div className="flex flex-col items-center">
                    <label htmlFor="image-upload" className="w-full cursor-pointer"><div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300">
                        <UploadIcon className="mx-auto" /><p className="mt-2 text-slate-300"><span className="font-semibold text-indigo-400">Clique para carregar</span> uma ou mais imagens</p><p className="text-xs text-slate-500">Transforme, edite e converta para PDF</p>
                    </div></label>
                    <input id="image-upload" type="file" accept="image/png, image/jpeg" multiple className="hidden" onChange={handleFileChange} />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Editor Principal */}
                        <div 
                            className={`flex-grow lg:w-2/3 bg-slate-900/50 p-4 rounded-lg flex items-center justify-center relative min-h-[40vh]`}
                            onPointerMove={handleEditorPointerMove}
                            onPointerLeave={handleEditorPointerLeave}
                        >
                             {isErasing && eraserCursorPos && eraserMode === 'brush' && (
                                <div
                                    className="rounded-full border-2 border-white bg-black bg-opacity-25 pointer-events-none absolute z-50"
                                    style={{
                                        width: `${eraserSize * 2}px`,
                                        height: `${eraserSize * 2}px`,
                                        left: `${eraserCursorPos.x}px`,
                                        top: `${eraserCursorPos.y}px`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                />
                            )}
                            {activePage && (isErasing ? (
                                <canvas ref={eraserCanvasRef} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerLeave={handleCanvasPointerUp} className={`max-w-full max-h-[55vh] object-contain ${eraserMode === 'brush' ? 'cursor-none' : 'cursor-crosshair'}`} />
                            ) : (
                                <img src={activePage.previewUrl} alt="Preview" style={{ transform: `rotate(${activePage.rotation}deg)` }} className={`max-w-full max-h-[55vh] object-contain transition-all ${FILTER_CLASSES[activePage.filter]}`} />
                            ))}
                        </div>
                        {/* Painel de Controle */}
                        <div className="flex-shrink-0 lg:w-1/3 space-y-4">
                            <>
                                <div className="p-4 bg-slate-700/50 rounded-lg">
                                    <h4 className="font-semibold text-slate-200 mb-3">Ajustes da Página {activePageIndex !== null ? activePageIndex + 1 : ''}</h4>
                                    
                                    {isErasing ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">Modo da Borracha</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button onClick={() => setEraserMode('brush')} className={`flex items-center justify-center gap-2 p-2 rounded text-sm ${eraserMode === 'brush' ? 'bg-indigo-600' : 'bg-slate-600 hover:bg-slate-500'}`}><EraserIcon className="w-4 h-4" /> Pincel</button>
                                                    <button onClick={() => setEraserMode('cutout')} className={`flex items-center justify-center gap-2 p-2 rounded text-sm ${eraserMode === 'cutout' ? 'bg-indigo-600' : 'bg-slate-600 hover:bg-slate-500'}`}><ScissorsIcon className="w-4 h-4" /> Recorte Reto</button>
                                                </div>
                                            </div>
                                            {eraserMode === 'brush' ? (
                                                <div>
                                                    <label htmlFor="eraser-size" className="block text-sm font-medium text-slate-400 mb-2">Tamanho da Borracha: {eraserSize}px</label>
                                                    <input type="range" id="eraser-size" min="2" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer" />
                                                </div>
                                            ) : (
                                                <div className='space-y-2'>
                                                     <p className='text-xs text-slate-400'>Clique para adicionar pontos e formar uma área. Tudo fora dela será apagado.</p>
                                                     <button onClick={() => setCutoutPoints([])} className="w-full p-2 text-sm font-semibold rounded bg-slate-600 hover:bg-slate-500">Limpar Pontos</button>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-2 border-t border-slate-600 pt-3 mt-3">
                                                <button onClick={handleApplyEraser} disabled={isApplyingEdit || (eraserMode === 'cutout' && cutoutPoints.length < 3)} className="p-2 text-sm font-semibold rounded bg-green-600 hover:bg-green-500 disabled:bg-slate-600 flex items-center justify-center">
                                                    {isApplyingEdit ? <><SpinnerIcon /> Processando...</> : (eraserMode === 'cutout' ? 'Aplicar Recorte' : 'Aplicar')}
                                                </button>
                                                <button onClick={handleCancelEraser} disabled={isApplyingEdit} className="p-2 text-sm font-semibold rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-50">Cancelar</button>
                                            </div>
                                        </div>
                                    ) : (
                                    <>
                                        <button onClick={() => updateActivePage({ filter: 'document' })} className={`w-full p-2 rounded text-sm font-semibold flex items-center justify-center gap-2 mb-3 ${activePage?.filter === 'document' ? 'bg-green-600 hover:bg-green-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}><MagicWandIcon /> Efeito Scanner</button>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={handleRemoveBackground} disabled={isAiLoading} className="flex items-center justify-center gap-2 p-2 bg-purple-600 rounded hover:bg-purple-500 disabled:bg-slate-600 text-sm font-semibold">{isAiLoading ? <SpinnerIcon /> : <MagicWandIcon />} Remover Fundo</button>
                                            <button onClick={() => setIsErasing(true)} className="flex items-center justify-center gap-2 p-2 bg-slate-600 rounded hover:bg-slate-500 text-sm font-semibold"><EraserIcon className="w-4 h-4" /> Borracha</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => activePage && updateActivePage({ rotation: (activePage.rotation + 270) % 360 })} className="flex items-center justify-center gap-2 p-2 bg-slate-600 rounded hover:bg-slate-500"><RotateLeftIcon/> Rotação</button><button onClick={() => activePage && updateActivePage({ rotation: (activePage.rotation + 90) % 360 })} className="flex items-center justify-center gap-2 p-2 bg-slate-600 rounded hover:bg-slate-500"><RotateRightIcon/> Rotação</button></div>
                                        <div className="mt-3"><label className="block text-sm font-medium text-slate-400 mb-1">Filtros Manuais</label><div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => updateActivePage({ filter: 'none' })} className={`p-2 text-xs rounded ${activePage?.filter === 'none' ? 'bg-indigo-600' : 'bg-slate-600 hover:bg-slate-500'}`}>Original</button>
                                            <button onClick={() => updateActivePage({ filter: 'grayscale' })} className={`p-2 text-xs rounded ${activePage?.filter === 'grayscale' ? 'bg-indigo-600' : 'bg-slate-600 hover:bg-slate-500'}`}>Tons de Cinza</button>
                                        </div></div>
                                    </>
                                    )}
                                </div>
                                <div className="p-4 bg-slate-700/50 rounded-lg">
                                    <h4 className="font-semibold text-slate-200 mb-3">Opções do PDF Final</h4>
                                    <div><label htmlFor="pageSize" className="block text-sm font-medium text-slate-400 mb-1">Tamanho da Página</label><select id="pageSize" value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)} className="w-full bg-slate-800 border-slate-600 rounded-md p-2 text-sm"><option value="A4">A4</option><option value="Letter">Carta</option></select></div>
                                    <div className='mt-2'><label htmlFor="orientation" className="block text-sm font-medium text-slate-400 mb-1">Orientação</label><select id="orientation" value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)} className="w-full bg-slate-800 border-slate-600 rounded-md p-2 text-sm"><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></div>
                                </div>
                            </>
                        </div>
                    </div>
                    {/* Lista de Miniaturas */}
                    <div className="w-full bg-slate-900/50 p-2 rounded-lg">
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {pages.map((page, index) => (
                                <div key={page.id} draggable onDragStart={() => (draggedItemIndex.current = index)} onDragEnter={() => (draggedOverItemIndex.current = index)} onDragEnd={handleDragSort} onDragOver={(e) => e.preventDefault()}
                                    className={`relative flex-shrink-0 w-24 h-32 rounded-md cursor-pointer border-2 ${activePageIndex === index ? 'border-indigo-500' : 'border-transparent'}`}
                                    onClick={() => setActivePageIndex(index)} >
                                    <img src={page.previewUrl} className="w-full h-full object-cover rounded" />
                                    <button onClick={(e) => { e.stopPropagation(); removePage(index); }} className="absolute top-1 right-1 p-0.5 bg-slate-800/70 rounded-full text-slate-400 hover:text-red-500"><TrashIcon className="w-3 h-3" /></button>
                                    <div className="absolute bottom-1 left-1 bg-slate-800/70 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{index + 1}</div>
                                </div>
                            ))}
                            <label htmlFor="image-upload-add" className="cursor-pointer w-24 h-32 flex-shrink-0"><div className="border-2 border-dashed border-slate-600 rounded-md h-full text-center hover:border-indigo-500 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                <span className="text-xs mt-1">Adicionar</span>
                            </div></label>
                            <input id="image-upload-add" type="file" accept="image/png, image/jpeg" multiple className="hidden" onChange={handleFileChange} />
                        </div>
                    </div>
                    {/* Botão Final */}
                    <div className="flex flex-col items-center">
                        {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
                        <button onClick={convertToPdf} disabled={isLoading || isAiLoading || isErasing} className="w-full md:w-auto mt-2 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-slate-600 flex items-center justify-center gap-2">
                            {isLoading ? <><SpinnerIcon /> Convertendo...</> : <><DownloadIcon /> Converter e Baixar ({pages.length} Páginas)</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageToPdf;

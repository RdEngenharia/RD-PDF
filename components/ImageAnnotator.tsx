import React, { useState, useRef, useEffect, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { UploadIcon, DownloadIcon, RectangleIcon, TypeIcon, ArrowUpRightIcon, MoveIcon, ZoomInIcon, EraserIcon } from './Icons';

type Tool = 'select' | 'rect' | 'text' | 'arrow' | 'zoom' | 'eraser';
type Annotation = {
    id: string;
    type: 'rect' | 'arrow' | 'text' | 'eraser';
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    fontSize?: number;
    path?: { x: number; y: number }[];
    strokeWidth?: number;
};

interface ImageFile { file: File; previewUrl: string; naturalWidth: number; naturalHeight: number; }
const MARKUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#ffffff', '#000000'];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

// Helper function to calculate text block height based on wrapping
const getTextBlockHeight = (context: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    let lines = 1;
    
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines++;
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    return lines * lineHeight;
};


// Helper function to wrap text on canvas
const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
};

const ImageAnnotator: React.FC = () => {
    const [image, setImage] = useState<ImageFile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    const [tool, setTool] = useState<Tool>('rect');
    const [color, setColor] = useState(MARKUP_COLORS[0]);
    const [eraserSize, setEraserSize] = useState(20);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [drawingAnnotation, setDrawingAnnotation] = useState<Annotation | null>(null);
    const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(new Image());

    const isPointerDown = useRef(false);
    const startPan = useRef({ x: 0, y: 0 });
    const startPoint = useRef({ x: 0, y: 0 });
    const dragStartAnnotationPos = useRef<{ x: number; y: number } | null>(null);
    const zoomStartPointY = useRef(0);
    const startZoom = useRef(1);

    const processFile = (file: File | null) => {
        // Handle resetting the component state
        if (file === null) {
            if (image) {
                URL.revokeObjectURL(image.previewUrl);
            }
            setImage(null);
            setAnnotations([]);
            setDrawingAnnotation(null);
            setEditingAnnotation(null);
            setSelectedAnnotationId(null);
            setError(null);
            return;
        }

        // Handle invalid file type
        if (!file.type.startsWith('image/')) {
            setError('Apenas arquivos de imagem são aceitos.');
            return;
        }

        // Process the new valid file
        setError(null);
        setAnnotations([]);
        setDrawingAnnotation(null);
        setEditingAnnotation(null);
        setSelectedAnnotationId(null);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            imageRef.current = img;
            setImage({ file, previewUrl: url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        };
        img.src = url;
    };
    
    const getTransformedPoint = (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { x: 0, y: 0 };
        const transform = ctx.getTransform();
        const invertedTransform = transform.inverse();
        const transformedPoint = new DOMPoint(x, y).matrixTransform(invertedTransform);
        return { x: transformedPoint.x, y: transformedPoint.y };
    };
    
    const worldToScreen = (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { x: 0, y: 0 };
        const transform = ctx.getTransform();
        const screenPoint = new DOMPoint(x, y).matrixTransform(transform);
        return { x: screenPoint.x, y: screenPoint.y };
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        canvas.width = canvas.parentElement!.clientWidth;
        canvas.height = canvas.parentElement!.clientHeight;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
        
        ctx.drawImage(imageRef.current, 0, 0);

        [...annotations, drawingAnnotation].forEach(ann => {
            if (!ann || ann.id === editingAnnotation?.id) return;
            ctx.strokeStyle = ann.color;
            ctx.fillStyle = ann.color;
            ctx.lineWidth = Math.max(4 / zoom, 2);

            switch (ann.type) {
                case 'rect':
                    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                    break;
                case 'arrow':
                    const headlen = Math.max(15 / zoom, 8);
                    const dx = ann.x + ann.width - ann.x;
                    const dy = ann.y + ann.height - ann.y;
                    const angle = Math.atan2(dy, dx);
                    ctx.beginPath(); ctx.moveTo(ann.x, ann.y); ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle - Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle + Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.stroke();
                    break;
                case 'text':
                    ctx.font = `${ann.fontSize}px sans-serif`;
                    ctx.textBaseline = 'top';
                    wrapText(ctx, ann.text || '', ann.x, ann.y, ann.width, ann.fontSize! * 1.2);
                    break;
                case 'eraser':
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                    ctx.lineWidth = ann.strokeWidth!;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    if (ann.path && ann.path.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(ann.path[0].x, ann.path[0].y);
                        for (let i = 1; i < ann.path.length; i++) {
                            ctx.lineTo(ann.path[i].x, ann.path[i].y);
                        }
                        ctx.stroke();
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    break;
            }
        });

        const selectedAnn = annotations.find(a => a.id === selectedAnnotationId);
        if (selectedAnn && !editingAnnotation) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = Math.max(2 / zoom, 1);
            ctx.setLineDash([6 / zoom, 3 / zoom]);
            ctx.strokeRect(selectedAnn.x, selectedAnn.y, selectedAnn.width, selectedAnn.height);
            ctx.setLineDash([]);
        }
    }, [image, annotations, zoom, offset, drawingAnnotation, editingAnnotation, selectedAnnotationId]);
    
    useEffect(() => {
        const handleResize = () => draw();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    useEffect(draw, [draw]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
                if (document.activeElement?.tagName.toLowerCase() === 'textarea') return;
                setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
                setSelectedAnnotationId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedAnnotationId]);

    const finishEditingText = useCallback(() => {
        if (!editingAnnotation) return;
        
        const finalAnnotation = { ...editingAnnotation };
        const textIsEmpty = finalAnnotation.text?.trim() === '';

        if (textIsEmpty) {
            setAnnotations(prev => prev.filter(a => a.id !== finalAnnotation.id));
        } else {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.font = `${finalAnnotation.fontSize}px sans-serif`;
                finalAnnotation.height = getTextBlockHeight(tempCtx, finalAnnotation.text!, finalAnnotation.width, finalAnnotation.fontSize!, finalAnnotation.fontSize! * 1.2);
            }
            
            const isExisting = annotations.some(a => a.id === finalAnnotation.id);
            if (isExisting) {
                setAnnotations(prev => prev.map(a => a.id === finalAnnotation.id ? finalAnnotation : a));
            } else {
                setAnnotations(prev => [...prev, finalAnnotation]);
            }
        }
        setEditingAnnotation(null);
    }, [editingAnnotation, annotations]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        isPointerDown.current = true;
        startPan.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        zoomStartPointY.current = e.clientY;
        startZoom.current = zoom;

        const rect = e.currentTarget.getBoundingClientRect();
        const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);
        startPoint.current = point;

        if (tool === 'select') {
            const hitAnnotation = [...annotations].reverse().find(ann => {
                const x1 = ann.x, y1 = ann.y;
                const x2 = ann.x + ann.width, y2 = ann.y + ann.height;
                return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
            });

            if (editingAnnotation && editingAnnotation.id !== hitAnnotation?.id) {
                finishEditingText();
            }

            if (hitAnnotation) {
                setSelectedAnnotationId(hitAnnotation.id);
                dragStartAnnotationPos.current = { x: hitAnnotation.x, y: hitAnnotation.y };
            } else {
                setSelectedAnnotationId(null);
            }
        } else if (tool === 'eraser') {
            setDrawingAnnotation({
                id: `temp-eraser`, type: 'eraser', color: 'black',
                path: [point], strokeWidth: eraserSize,
                x:0, y:0, width:0, height:0,
            });
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isPointerDown.current || !image) return;

        if (tool === 'zoom') {
            const deltaY = zoomStartPointY.current - e.clientY;
            const SENSITIVITY = 0.005;
            const newZoom = startZoom.current * Math.exp(deltaY * SENSITIVITY);
            setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom)));
        } else if (tool === 'select' && !selectedAnnotationId) {
            setOffset({ x: e.clientX - startPan.current.x, y: e.clientY - startPan.current.y });
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);

            if (tool === 'select' && selectedAnnotationId && dragStartAnnotationPos.current) {
                const dx = point.x - startPoint.current.x;
                const dy = point.y - startPoint.current.y;
                setAnnotations(prev => prev.map(ann => 
                    ann.id === selectedAnnotationId 
                    ? { ...ann, x: dragStartAnnotationPos.current!.x + dx, y: dragStartAnnotationPos.current!.y + dy } 
                    : ann
                ));
            } else if (tool === 'rect' || tool === 'arrow') {
                 setDrawingAnnotation({
                    id: `temp-${Date.now()}`, type: tool, color,
                    x: startPoint.current.x, y: startPoint.current.y,
                    width: point.x - startPoint.current.x, height: point.y - startPoint.current.y,
                });
            } else if (tool === 'eraser' && drawingAnnotation) {
                setDrawingAnnotation(prev => ({ ...prev!, path: [...(prev!.path || []), point] }));
            }
        }
    };

    const handlePointerUp = () => {
        isPointerDown.current = false;
        if (drawingAnnotation) {
            if (drawingAnnotation.type === 'eraser' && (!drawingAnnotation.path || drawingAnnotation.path.length < 2)) {
                // Do not add dot erasures
            } else {
                setAnnotations(prev => [...prev, { ...drawingAnnotation, id: `ann-${Date.now()}` }]);
            }
            setDrawingAnnotation(null);
        }
        dragStartAnnotationPos.current = null;
    };
    
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (tool === 'text' && !editingAnnotation) {
            const rect = e.currentTarget.getBoundingClientRect();
            const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);
            const fontSize = Math.max(16, image!.naturalWidth * 0.02);
            setEditingAnnotation({
                id: `ann-${Date.now()}`, type: 'text', color, text: '', fontSize,
                x: point.x, y: point.y, width: 200, height: fontSize * 1.2,
            });
            setSelectedAnnotationId(null);
        }
    };

    const handleDownload = (format: 'jpeg' | 'png') => {
        if (!image) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) {
            setError("Não foi possível criar o contexto do canvas para download.");
            return;
        }
        // Draw background for JPEG
        if (format === 'jpeg') {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        }

        // 1. Draw original image
        ctx.drawImage(imageRef.current, 0, 0);

        // 2. Apply eraser annotations
        annotations.filter(a => a.type === 'eraser').forEach(ann => {
             if (ann.path && ann.path.length > 1) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.lineWidth = ann.strokeWidth!;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(ann.path[0].x, ann.path[0].y);
                for (let i = 1; i < ann.path.length; i++) {
                    ctx.lineTo(ann.path[i].x, ann.path[i].y);
                }
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            }
        });

        // 3. Draw other annotations on top
        annotations.filter(a => a.type !== 'eraser').forEach(ann => {
            ctx.strokeStyle = ann.color;
            ctx.fillStyle = ann.color;
            ctx.lineWidth = 4; // Consistent width for download

            switch (ann.type) {
                case 'rect':
                    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                    break;
                case 'arrow':
                    const headlen = 15;
                    const dx = ann.x + ann.width - ann.x;
                    const dy = ann.y + ann.height - ann.y;
                    const angle = Math.atan2(dy, dx);
                    ctx.beginPath(); ctx.moveTo(ann.x, ann.y); ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle - Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle + Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.stroke();
                    break;
                case 'text':
                    ctx.font = `${ann.fontSize}px sans-serif`;
                    ctx.textBaseline = 'top';
                    wrapText(ctx, ann.text || '', ann.x, ann.y, ann.width, ann.fontSize! * 1.2);
                    break;
            }
        });

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const fileName = `rd-pdf-anotado.${format}`;
        tempCanvas.toBlob((blob) => {
            if (blob) {
                saveAs(blob, fileName);
            }
        }, mimeType, 0.95);
    };

    return (
        <div className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in flex flex-col gap-4"
             onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
             onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
             onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
             onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); processFile(e.dataTransfer.files?.[0] || null); }}>

            {isDragging && (<div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 pointer-events-none"><div className="text-center"><UploadIcon className="mx-auto w-16 h-16 text-indigo-400" /><p className="mt-4 text-lg font-semibold text-slate-200">Solte a imagem aqui</p></div></div>)}
            
            {!image ? (
                 <div className="flex flex-col items-center">
                    <label htmlFor="image-annotator-upload" className="w-full cursor-pointer"><div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300">
                        <UploadIcon className="mx-auto" /><p className="mt-2 text-slate-300"><span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste e solte uma imagem</p><p className="text-xs text-slate-500">Adicione anotações, textos e formas</p>
                    </div></label>
                    <input id="image-annotator-upload" type="file" accept="image/*" className="hidden" onChange={(e) => processFile(e.target.files?.[0] || null)} />
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 p-3 rounded-lg">
                        {/* Tool selection */}
                        <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-md">
                            <button onClick={() => setTool('select')} className={`p-2 rounded ${tool === 'select' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Selecionar/Mover"><MoveIcon className="w-5 h-5"/></button>
                            <button onClick={() => setTool('rect')} className={`p-2 rounded ${tool === 'rect' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Retângulo"><RectangleIcon className="w-5 h-5"/></button>
                            <button onClick={() => setTool('arrow')} className={`p-2 rounded ${tool === 'arrow' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Seta"><ArrowUpRightIcon className="w-5 h-5"/></button>
                            <button onClick={() => setTool('text')} className={`p-2 rounded ${tool === 'text' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Texto"><TypeIcon className="w-5 h-5"/></button>
                            <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Borracha"><EraserIcon className="w-5 h-5"/></button>
                            <button onClick={() => setTool('zoom')} className={`p-2 rounded ${tool === 'zoom' ? 'bg-indigo-600' : 'hover:bg-slate-600'}`} title="Zoom"><ZoomInIcon className="w-5 h-5"/></button>
                        </div>
                        {/* Color selection */}
                        <div className="flex items-center gap-2">
                            {MARKUP_COLORS.map(c => (
                                <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`w-6 h-6 rounded-full ring-2 ${color === c ? 'ring-indigo-400' : 'ring-transparent hover:ring-slate-400'}`}/>
                            ))}
                        </div>
                        {/* Eraser size */}
                        {tool === 'eraser' && (
                            <div className="flex items-center gap-2">
                                <label htmlFor="eraser-size" className="text-sm text-slate-400">Tamanho:</label>
                                <input type="range" id="eraser-size" min="5" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-24"/>
                            </div>
                        )}
                        {/* Download buttons */}
                        <div className="flex-grow flex justify-end gap-2">
                            <button onClick={() => handleDownload('png')} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 text-sm flex items-center gap-2"><DownloadIcon className="w-4 h-4"/> Baixar PNG</button>
                            <button onClick={() => handleDownload('jpeg')} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-500 text-sm">Baixar JPG</button>
                        </div>
                    </div>
                    {/* Canvas Area */}
                    <div className="flex-grow bg-slate-900/50 rounded-lg overflow-hidden relative min-h-[60vh]">
                        <canvas ref={canvasRef} className="w-full h-full" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onDoubleClick={() => { if(selectedAnnotationId && annotations.find(a => a.id === selectedAnnotationId)?.type === 'text') setEditingAnnotation(annotations.find(a => a.id === selectedAnnotationId)!) }} onClick={handleCanvasClick} />
                        {editingAnnotation && (
                            <textarea
                                autoFocus
                                value={editingAnnotation.text}
                                onChange={(e) => setEditingAnnotation(prev => prev ? {...prev, text: e.target.value} : null)}
                                onBlur={finishEditingText}
                                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEditingText(); } }}
                                style={{
                                    position: 'absolute',
                                    left: `${worldToScreen(editingAnnotation.x, editingAnnotation.y).x}px`,
                                    top: `${worldToScreen(editingAnnotation.x, editingAnnotation.y).y}px`,
                                    width: `${editingAnnotation.width * zoom}px`,
                                    minHeight: `${editingAnnotation.height * zoom}px`,
                                    fontSize: `${editingAnnotation.fontSize! * zoom}px`,
                                    lineHeight: 1.2,
                                    color: editingAnnotation.color,
                                    background: 'rgba(0,0,0,0.7)',
                                    border: '1px dashed #3b82f6',
                                    outline: 'none',
                                    resize: 'none',
                                    zIndex: 10,
                                    overflow: 'hidden',
                                }}
                                className="text-white p-1 rounded"
                            />
                        )}
                    </div>
                </>
            )}
            {error && <p className="text-red-400 mt-2 text-center">{error}</p>}
        </div>
    );
};

export default ImageAnnotator;

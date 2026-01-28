import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CANVAS_CONFIG, COLORS } from '@pictobattle/shared';
import type { DrawStroke, DrawPoint } from '@pictobattle/shared';
import { Eraser, Trash2 } from 'lucide-react';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentColor, setCurrentColor] = useState(COLORS[0]);
    const [brushSize, setBrushSize] = useState(3);
    const [isEraser, setIsEraser] = useState(false);
    const [currentStroke, setCurrentStroke] = useState<DrawPoint[]>([]);

    const { room, strokes, sendDraw, clearCanvas } = useGameStore();
    const currentPlayerId = useGameStore((state) => state.currentPlayerId);

    // Check if the CURRENT user is the drawer
    const currentPlayer = room?.players.find((p) => p.id === currentPlayerId);
    const canDraw = currentPlayer?.isDrawing && room?.gameState === 'drawing';

    // Draw on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = CANVAS_CONFIG.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw all completed strokes
        strokes.forEach((stroke) => {
            if (stroke.points.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

            for (let i = 1; i < stroke.points.length; i++) {
                const point = stroke.points[i];
                ctx.lineTo(point.x, point.y);
                ctx.strokeStyle = point.isEraser ? CANVAS_CONFIG.backgroundColor : point.color;
                ctx.lineWidth = point.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        });

        // Draw current stroke being drawn (live preview)
        if (currentStroke.length > 1) {
            ctx.beginPath();
            ctx.moveTo(currentStroke[0].x, currentStroke[0].y);

            for (let i = 1; i < currentStroke.length; i++) {
                const point = currentStroke[i];
                ctx.lineTo(point.x, point.y);
                ctx.strokeStyle = point.isEraser ? CANVAS_CONFIG.backgroundColor : point.color;
                ctx.lineWidth = point.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        }
    }, [strokes, currentStroke]);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canDraw) return;

        setIsDrawing(true);
        const coords = getCoordinates(e);
        const point: DrawPoint = {
            ...coords,
            color: currentColor,
            size: isEraser ? CANVAS_CONFIG.eraserSize : brushSize,
            isEraser,
        };
        setCurrentStroke([point]);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !canDraw) return;

        const coords = getCoordinates(e);
        const point: DrawPoint = {
            ...coords,
            color: currentColor,
            size: isEraser ? CANVAS_CONFIG.eraserSize : brushSize,
            isEraser,
        };

        setCurrentStroke((prev) => [...prev, point]);
    };

    const handleMouseUp = () => {
        if (!isDrawing || !canDraw) return;

        setIsDrawing(false);
        if (currentStroke.length > 0) {
            const stroke: DrawStroke = {
                points: currentStroke,
                timestamp: Date.now(),
            };
            sendDraw(stroke);
            setCurrentStroke([]);
        }
    };

    const handleClearCanvas = () => {
        if (canDraw) {
            clearCanvas();
        }
    };

    return (
        <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4">
                {/* Drawing Tools */}
                {canDraw && (
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {/* Color Palette */}
                        <div className="flex gap-1">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={`w-8 h-8 rounded-full border-2 ${currentColor === color && !isEraser ? 'border-primary scale-110' : 'border-base-300'
                                        }`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => {
                                        setCurrentColor(color);
                                        setIsEraser(false);
                                    }}
                                />
                            ))}
                        </div>

                        {/* Brush Size */}
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="1"
                                max="20"
                                value={brushSize}
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="range range-primary range-xs w-24"
                            />
                            <span className="text-sm">{brushSize}px</span>
                        </div>

                        {/* Eraser */}
                        <button
                            className={`btn btn-sm ${isEraser ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setIsEraser(!isEraser)}
                        >
                            <Eraser size={16} />
                        </button>

                        {/* Clear Canvas */}
                        <button className="btn btn-sm btn-error" onClick={handleClearCanvas}>
                            <Trash2 size={16} />
                            Clear
                        </button>
                    </div>
                )}

                {/* Canvas */}
                <div className="flex justify-center bg-white rounded-lg p-2">
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_CONFIG.width}
                        height={CANVAS_CONFIG.height}
                        className={`border-2 border-base-300 rounded max-w-full h-auto ${canDraw ? 'cursor-crosshair' : 'cursor-default'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>

                {/* Current Word Hint */}
                {room?.gameState === 'drawing' && room.currentWord && (
                    <div className="text-center mt-2">
                        {canDraw ? (
                            <p className="text-lg font-bold">
                                Draw: <span className="text-primary">{room.currentWord}</span>
                            </p>
                        ) : (
                            <p className="text-lg font-mono tracking-widest">
                                {room.currentWord.split('').map((char, i) => {
                                    const revealedIndices = room.revealedLetters?.[currentPlayer?.id || ''] || [];
                                    const isRevealed = revealedIndices.includes(i);
                                    const isSpecial = char === ' ' || char === '-';

                                    return (
                                        <span key={i} className={isRevealed ? "text-primary font-bold" : ""}>
                                            {isRevealed || isSpecial ? char : '_'}
                                            {' '}
                                        </span>
                                    );
                                })}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

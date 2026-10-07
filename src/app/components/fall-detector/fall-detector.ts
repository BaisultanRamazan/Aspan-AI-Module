import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Pose, Results, NormalizedLandmarkList } from '@mediapipe/pose';

@Component({
  selector: 'app-fall-detector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="detector-container">
      <div 
        class="status-badge" 
        [class.alert]="isFallen()" 
        [class.safe]="!isFallen()"
      >
        {{ statusMessage() }}
      </div>

      <video #webcam playsinline autoplay muted></video>
      <canvas #overlayCanvas></canvas>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .detector-container {
      position: relative;
      width: 100%;
      height: 100%;
    }
    .status-badge {
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 700;
      z-index: 10;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      transition: all 0.3s ease;
      white-space: nowrap;
    }
    .safe { color: #4ade80; }
    .alert {
      background: #dc2626 !important;
      color: #ffffff;
      animation: pulse 0.6s infinite alternate;
    }
    @keyframes pulse {
      from { transform: translateX(-50%) scale(1); }
      to { transform: translateX(-50%) scale(1.05); }
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 5;
      pointer-events: none;
    }
  `]
})
export class FallDetectorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('webcam') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlayCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  statusMessage = signal<string>('Инициализация нейросети...');
  isFallen = signal<boolean>(false);

  private pose!: Pose;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isProcessing = false;
  private horizontalStartTime: number | null = null;

  ngAfterViewInit(): void {
    this.initMediaPipe();
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.pose) {
      this.pose.close();
    }
  }

  private async initMediaPipe(): Promise<void> {
    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 0, // Lite для быстрой работы на телефонах
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.pose.onResults((results) => this.onResults(results));

    try {
      await this.pose.initialize();
      await this.startCamera();
    } catch (error) {
      this.statusMessage.set('Ошибка загрузки модели');
      console.error(error);
    }
  }

  private async startCamera(): Promise<void> {
    const video = this.videoRef.nativeElement;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      video.srcObject = this.mediaStream;
      video.onloadedmetadata = () => {
        video.play();
        this.statusMessage.set('Поиск человека...');
        this.runFrameLoop();
      };
    } catch (err) {
      this.statusMessage.set('Доступ к камере отклонен');
      console.error(err);
    }
  }

  private stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private runFrameLoop = async (): Promise<void> => {
    const video = this.videoRef.nativeElement;

    if (video.readyState >= 2 && !this.isProcessing) {
      this.isProcessing = true;
      try {
        await this.pose.send({ image: video });
      } catch (e) {
        console.error('Ошибка анализа кадра:', e);
      }
      this.isProcessing = false;
    }

    this.animationFrameId = requestAnimationFrame(this.runFrameLoop);
  };

  private onResults(results: Results): void {
    const canvas = this.canvasRef.nativeElement;
    const video = this.videoRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.poseLandmarks) {
      this.statusMessage.set('Человек не в кадре');
      this.isFallen.set(false);
      this.horizontalStartTime = null;
      return;
    }

    const lm = results.poseLandmarks;
    const leftShoulder = lm[11], rightShoulder = lm[12];
    const leftHip = lm[23], rightHip = lm[24];

    const midShoulder = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    };
    const midHip = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };

    const dx = Math.abs(midShoulder.x - midHip.x);
    const dy = Math.abs(midShoulder.y - midHip.y);
    const isHorizontal = dy < dx * 0.8;
    const now = performance.now();

    if (isHorizontal) {
      if (!this.horizontalStartTime) this.horizontalStartTime = now;
      if (now - this.horizontalStartTime > 1000) {
        this.isFallen.set(true);
      }
    } else {
      this.horizontalStartTime = null;
      this.isFallen.set(false);
    }

    this.statusMessage.set(this.isFallen() ? 'ВНИМАНИЕ: ПАДЕНИЕ!' : 'Положение: Норма');
    this.drawBoundingBoxAndSkeleton(ctx, canvas, lm, this.isFallen());
  }

  private drawBoundingBoxAndSkeleton(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    landmarks: NormalizedLandmarkList,
    fallen: boolean
  ): void {
    const color = fallen ? '#dc2626' : '#4ade80';
    const label = fallen ? 'ПАДЕНИЕ!' : 'СТОИТ';

    let minX = canvas.width, maxX = 0;
    let minY = canvas.height, maxY = 0;

    const points = landmarks.map((pt) => {
      const x = pt.x * canvas.width;
      const y = pt.y * canvas.height;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return { x, y, visibility: pt.visibility ?? 0 };
    });

    const padding = 20;
    minX = Math.max(0, minX - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    minY = Math.max(0, minY - padding);
    maxY = Math.min(canvas.height, maxY + padding);

    // Bounding Box
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

    // Текстовая плашка
    ctx.fillStyle = color;
    ctx.font = 'bold 16px -apple-system, sans-serif';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(minX, minY - 30, textWidth + 16, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, minX + 8, minY - 8);

    // Соединения скелета
    const connections: [number, number][] = [
      [11, 12], [11, 23], [12, 24], [23, 24],
      [11, 13], [13, 15], [12, 14], [14, 16],
      [23, 25], [25, 27], [24, 26], [26, 28]
    ];

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    connections.forEach(([i, j]) => {
      const pt1 = points[i], pt2 = points[j];
      if (pt1 && pt2 && pt1.visibility > 0.5 && pt2.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      }
    });

    // Суставы
    const activeIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    points.forEach((pt, idx) => {
      if (activeIndices.includes(idx) && pt.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }
}
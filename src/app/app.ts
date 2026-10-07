import { Component } from '@angular/core';
import { FallDetectorComponent } from './components/fall-detector/fall-detector';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FallDetectorComponent],
  template: `<app-fall-detector></app-fall-detector>`
})
export class App {}
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FallDetector } from './fall-detector';

describe('FallDetector', () => {
  let component: FallDetector;
  let fixture: ComponentFixture<FallDetector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FallDetector],
    }).compileComponents();

    fixture = TestBed.createComponent(FallDetector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

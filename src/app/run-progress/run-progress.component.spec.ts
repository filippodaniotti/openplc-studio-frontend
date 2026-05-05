import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunProgressComponent } from './run-progress.component';

describe('RunProgressComponent', () => {
  let component: RunProgressComponent;
  let fixture: ComponentFixture<RunProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RunProgressComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RunProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

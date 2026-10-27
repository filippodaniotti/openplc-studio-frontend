import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toolbar } from 'primeng/toolbar';
import { ThemeService } from '../shared/services/theme.service';

@Component({
  selector: 'plc-header',
  imports: [CommonModule, ButtonModule, Toolbar],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  constructor(
    public readonly router: Router,
    private readonly themeService: ThemeService,
  ) {}

  public get isDarkMode(): boolean {
    return this.themeService.isDarkMode.value;
  }

  public get isParticipantPage(): boolean {
    return this.isActive('/listening-participant');
  }

  public isActive(path: string): boolean {
    const currentPath = this.router.url.split(/[?#]/, 1)[0];
    return currentPath === path || currentPath.startsWith(`${path}/`);
  }

  public toggleDarkMode(): void {
    this.themeService.toggle();
  }
}

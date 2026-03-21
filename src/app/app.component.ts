import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { HeaderComponent } from './header/header.component';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { WsService } from './shared/services/ws.service';
import { debounceTime, tap } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, ToggleButtonModule, FormsModule, HeaderComponent, ToastModule],
  providers: [MessageService, WsService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  public title = 'PLC Testbench Platform';

  constructor(
    private readonly messageService: MessageService,
    private readonly wsService: WsService,
  ) {}

  public ngOnInit(): void {
    this.wsService
      .getMessages()
      .pipe(
        debounceTime(300),
        tap((message: any) =>
          this.messageService.add({ severity: 'success', summary: 'Run completed', detail: JSON.parse(message).msg }),
        ),
      )
      .subscribe();

    setTimeout(() => this.wsService.sendMessage({ msg: 'aaa' }), 100);
  }
}

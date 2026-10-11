import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  PluginInventory,
  PluginInventoryDto,
  PluginInventoryItem,
  PluginSource,
  PluginSourceDto,
  PluginValidation,
} from '../interfaces/plugin.interface';

@Injectable({ providedIn: 'root' })
export class PluginsClient {
  private readonly api = '/api/plugins';

  constructor(private readonly http: HttpClient) {}

  public uploadPlugin(file: File): Observable<unknown> {
    const data = new FormData();
    data.append('file', file);
    return this.http.post(this.api, data);
  }

  public getPlugins(): Observable<PluginInventory> {
    return this.http.get<PluginInventoryDto>(this.api).pipe(
      map((dto) => ({
        scannedAt: dto.scanned_at,
        items: dto.items.map((item) => this.mapItem(item)),
      })),
    );
  }

  public getSource(filename: string): Observable<PluginSource> {
    return this.http
      .get<PluginSourceDto>(`${this.api}/${encodeURIComponent(filename)}/source`)
      .pipe(map((dto) => ({ ...dto, plugin: this.mapItem(dto.plugin) })));
  }

  public validateSource(filename: string, content: string): Observable<PluginValidation> {
    return this.http.post<PluginValidation>(`${this.api}/${encodeURIComponent(filename)}/validate`, { content });
  }

  public saveSource(filename: string, content: string, revision: string): Observable<PluginSource> {
    return this.http
      .put<PluginSourceDto>(`${this.api}/${encodeURIComponent(filename)}/source`, { content, revision })
      .pipe(map((dto) => ({ ...dto, plugin: this.mapItem(dto.plugin) })));
  }

  private mapItem(item: PluginInventoryDto['items'][number]): PluginInventoryItem {
    return {
      filename: item.filename,
      status: item.status,
      moduleType: item.module_type,
      error: item.error,
      spec: item.spec
        ? {
            name: item.spec.name,
            settings: item.spec.settings,
            constraints: item.spec.constraints.map((constraint) => ({
              type: constraint.type,
              setting: constraint.setting,
              relatedSetting: constraint.related_setting,
              message: constraint.message,
            })),
          }
        : null,
    };
  }
}

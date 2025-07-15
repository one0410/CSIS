import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-site-monthly-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-monthly-report.component.html',
  styleUrl: './site-monthly-report.component.scss'
})
export class SiteMonthlyReportComponent {
  siteId = signal<string>('');

  constructor(private route: ActivatedRoute) {
    this.siteId.set(this.route.snapshot.params['id']);
  }
} 
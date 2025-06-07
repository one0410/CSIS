import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-form-config',
  templateUrl: './form-config.component.html',
  styleUrls: ['./form-config.component.scss'],
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet]
})
export class FormConfigComponent implements OnInit {
  constructor() { }

  ngOnInit(): void {
  }
} 
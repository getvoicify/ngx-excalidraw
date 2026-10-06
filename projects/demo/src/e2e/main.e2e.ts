import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from '../app/app';
import { appConfig } from '../app/app.config';
import { e2eHooksConfig } from './e2e-hooks.config';

bootstrapApplication(App, mergeApplicationConfig(appConfig, e2eHooksConfig)).catch((err) =>
  console.error(err),
);

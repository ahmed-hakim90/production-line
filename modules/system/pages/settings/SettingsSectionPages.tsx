import React from 'react';
import { Settings } from '../Settings';
import type { SettingsSectionKey } from '../../hooks/useSystemSettingsController';

const SettingsSectionPage: React.FC<{ section: SettingsSectionKey }> = ({ section }) => (
  <Settings section={section} />
);

export const GeneralSettingsPage: React.FC = () => <SettingsSectionPage section="general" />;
export const AppearanceSettingsPage: React.FC = () => <SettingsSectionPage section="appearance" />;
export const ProductionSettingsPage: React.FC = () => <SettingsSectionPage section="production" />;
export const DashboardSettingsPage: React.FC = () => <SettingsSectionPage section="dashboards" />;
export const AlertSettingsPage: React.FC = () => <SettingsSectionPage section="alerts" />;
export const ReportSettingsPage: React.FC = () => <SettingsSectionPage section="reports" />;
export const DataSettingsPage: React.FC = () => <SettingsSectionPage section="data" />;
export const ClientVersionSettingsPage: React.FC = () => <SettingsSectionPage section="clientVersion" />;
export const BackupSettingsPage: React.FC = () => <SettingsSectionPage section="backup" />;

import React from 'react';
import { GlobalModalEnhancer } from '../GlobalModalEnhancer';
import { GlobalCreateReportModal } from './modals/GlobalCreateReportModal';
import { GlobalImportReportsModal } from './modals/GlobalImportReportsModal';
import { GlobalCreateWorkOrderModal } from './modals/GlobalCreateWorkOrderModal';
import { GlobalCreateProductModal } from './modals/GlobalCreateProductModal';
import { GlobalCreateLineModal } from './modals/GlobalCreateLineModal';
import { GlobalCreateWarehouseModal } from './modals/GlobalCreateWarehouseModal';
import { GlobalCreateRawMaterialModal } from './modals/GlobalCreateRawMaterialModal';
import { GlobalImportInventoryInByCodeModal } from './modals/GlobalImportInventoryInByCodeModal';

/**
 * Central host for modal UX layer.
 * Keeps current enhancer behavior while we migrate pages
 * to key-based GlobalModalManager registrations.
 */
export const ModalHost: React.FC = () => {
  return (
    <>
      <GlobalModalEnhancer />
      <GlobalCreateReportModal />
      <GlobalImportReportsModal />
      <GlobalCreateWorkOrderModal />
      <GlobalCreateProductModal />
      <GlobalCreateLineModal />
      <GlobalImportInventoryInByCodeModal />
      <GlobalCreateWarehouseModal />
      <GlobalCreateRawMaterialModal />
    </>
  );
};


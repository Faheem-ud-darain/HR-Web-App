'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import { WarehouseManager } from '@/components/ui/WarehouseManager';

export default function AdminWarehousesPage() {
  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-orange-600" /> Warehouse Management
        </h1>
        <p className="text-slate-500">Configure global warehouse coordinates and geofence tracking radii for US-based teams.</p>
      </div>
      <WarehouseManager />
    </div>
  );
}

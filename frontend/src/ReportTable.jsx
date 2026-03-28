import React from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';

export default function ReportTable({ tableHeader='',reportData = [], loading }) {
  const headerGroup = (
    <ColumnGroup>
      <Row>
        <Column header="基本資料" colSpan={3} />
        <Column header="啟動" colSpan={3} />
        <Column header="熄火" colSpan={3} />
        <Column header="行駛" />
        <Column header="運行" />
        <Column header="停留" />
      </Row>
      <Row className='text-xs'>
        <Column header="車號" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="日期" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="序號" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="時間" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="區域" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="地址" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="時間" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="區域" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="地址" style={{ whiteSpace: 'nowrap' }}/>
        <Column header="距離(KM)" />
        <Column header="時間(min)" />
        <Column header="時間(min)" />
      </Row>
    </ColumnGroup>
  );

  

  return (
      <DataTable
        value={reportData}
        dataKey="id"
        showGridlines
        stripedRows
        loading={loading}
        emptyMessage={loading ? '資料載入中...' : '請選擇條件並點擊「檢視報表」'}
        headerColumnGroup={headerGroup}
        header={tableHeader}
        className="report-table text-s"
      >
        <Column field="CarNo" />
        <Column field="TripDate" />
        <Column field="seq" />
        <Column field="BeginTime" />
        <Column field="BegArea" />
        <Column field="BegAddress" />
        <Column field="EndTime" />
        <Column field="EndArea" />
        <Column field="EndAddress" />
        <Column field="TotalDistance" />
        <Column field="TotalDrivingTime" />
        <Column field="StayTime" />
      </DataTable>

  );
}
import React from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';

export default function ReportTable({ tableHeader = '', reportData = [], loading }) {
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
      <Row className="text-xs">
        <Column header="車號" style={{ whiteSpace: 'nowrap' }} />
        <Column header="日期" style={{ whiteSpace: 'nowrap' }} />
        <Column header="序號" style={{ whiteSpace: 'nowrap' }} />
        <Column header="時間" style={{ whiteSpace: 'nowrap' }} />
        <Column header="區域" style={{ whiteSpace: 'nowrap' }} />
        <Column header="地址" style={{ whiteSpace: 'nowrap' }} />
        <Column header="時間" style={{ whiteSpace: 'nowrap' }} />
        <Column header="區域" style={{ whiteSpace: 'nowrap' }} />
        <Column header="地址" style={{ whiteSpace: 'nowrap' }} />
        <Column header="距離(KM)" />
        <Column header="時間(min)" />
        <Column header="時間(min)" />
      </Row>
    </ColumnGroup>
  );

  const rowClassName = (rowData) => {
    return rowData.isTotalRow ? 'total-row font-bold' : '';
  };

  const carNoBody = (rowData) => {
    return rowData.isTotalRow ? '合計' : rowData.CarNo;
  };

  const emptyBody = (field) => (rowData) => {
    return rowData.isTotalRow ? '' : rowData[field];
  };

  return (
    <DataTable
      value={reportData}
      dataKey="id"
      showGridlines
      stripedRows
      loading={loading}
      rowClassName={rowClassName}
      emptyMessage={loading ? '資料載入中...' : '請選擇條件並點擊「檢視報表」'}
      headerColumnGroup={headerGroup}
      header={tableHeader}
      className="report-table text-s"
    >
      <Column field="CarNo" body={carNoBody} />
      <Column field="TripDate" body={emptyBody('TripDate')} />
      <Column field="seq" body={emptyBody('seq')} />
      <Column field="BeginTime" body={emptyBody('BeginTime')} />
      <Column field="BegArea" body={emptyBody('BegArea')} />
      <Column field="BegAddress" body={emptyBody('BegAddress')} />
      <Column field="EndTime" body={emptyBody('EndTime')} />
      <Column field="EndArea" body={emptyBody('EndArea')} />
      <Column field="EndAddress" body={emptyBody('EndAddress')} />
      <Column field="TotalDistance" />
      <Column field="TotalDrivingTime" />
      <Column field="StayTime" />
    </DataTable>
  );
}
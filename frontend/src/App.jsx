import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { MultiSelect } from 'primereact/multiselect';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputText } from "primereact/inputtext";
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import ReportTable from './ReportTable';
import '../node_modules/primeicons/primeicons.css';
import '../node_modules/primeflex/primeflex.css'
import './App.css'

function App() {
  //const COMPANY_ID="201705-000001";
  const apiUrl = import.meta.env.VITE_API_URL;
  const [filters, setFilters] = useState({
    fleets: [],
    cars: [],
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: ''
  })
  const [companyId, setCompanyId] = useState('')
  const [reportData, setReportData] = useState([])
  const [tableHeader, setTableHeader] = useState('');

  const [loading, setLoading] = useState(false)
  const [loadingFleets, setLoadingFleets] = useState(false)
  const [loadingCars, setLoadingCars] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchTimeRange, setSearchTimeRange] = useState('')
  const [fleets = [], setFleets] = useState([]);
  const [carsByFleetIds = [], setCarsByFleetIds] = useState([])
  const toast = useRef(null);
  const fleetsRef = useRef(null);
  const carsRef = useRef(null);
  const skipCarsFocusRef = useRef(false);

  let today = new Date();
  let minDate = new Date(today);
  minDate.setMonth(today.getMonth() - 3);

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCompanyId(params.get('companyId') || '');
    
  }, []);

  const fetchFleets = async () => {
    try {
      console.log(companyId);
      setLoadingFleets(true)
      const res = await fetch(`${apiUrl}/api/getFleets?companyId=${companyId}`);
      const data = await res.json();
      const fleetOptions = data.map(f => ({
        label: f.FleetName,
        value: f.fleetID
      }))
      setFleets(fleetOptions);
    } catch (err) {
      console.error("error fetching fleets", err);
    } finally {
      setLoadingFleets(false)
    }
  }



  // Fetch cars when fleet changes


  const fetchCarsByFleetIds = async (selectedFleets) => {
    setLoadingCars(true)

    try {
      const params = new URLSearchParams();

      selectedFleets.forEach(f => {
        params.append("fleetID", f)
      })
      const res = await fetch(`${apiUrl}/api/getCarsByFleetIds?${params.toString()}`)

      const data = await res.json()

      const carsByFleetIds = data.map(c => ({
        fleetID: c.fleetID,
        label: c.CarNo,
        value: c.CarID
      }))
      setCarsByFleetIds(carsByFleetIds)
    } catch (err) {
      console.error("error fetching cars", err)
    } finally {
      setLoadingCars(false)

    }
  }




  const formatDateTime = (date, time) => {
    if (!date) return '';

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Number(time),
      0,
      0
    );
  };
  const formatDisplayDateTime = (value) => {
    const date = new Date(value);
    if (isNaN(date)) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hour}:${minute}`;
  };
  const loadData = async () => {

    const newFilters = {
      ...filters,
      startTime: filters.startTime?.name || '',
      endTime: filters.endTime?.name || ''
    };

    if (!newFilters.fleets?.length || !newFilters.cars?.length || !newFilters.startDate || !newFilters.endDate || !newFilters.startTime || !newFilters.endTime) {
      setLoading(false);
      toast.current.show({ severity: 'warn', summary: 'Warning', detail: '請填寫完整搜尋條件', life: 3000 });
      return;
    }

    const formatBegin = formatDateTime(newFilters.startDate, newFilters.startTime);
    const formatEnd = formatDateTime(newFilters.endDate, newFilters.endTime)
    if (formatBegin > formatEnd) {
      setLoading(false);
      toast.current.show({ severity: 'warn', summary: 'Warning', detail: '開始日期應小於結束日期', life: 3000 });
      return;
    }

    const data = {
      fleets: newFilters.fleets,
      cars: newFilters.cars,
      beginDateTime: formatBegin,
      endDateTime: formatEnd,
      companyId: companyId
    };
    await fetchReport(data);
  }

  const fetchReport = async (loadedData) => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loadedData)
      })

      if (response.ok) {
        const data = await response.json()
        setHasSearched(true);
        setTableHeader(data.header || '');
        setReportData(data.rows || []);
        setSearchTimeRange(
          `${formatDisplayDateTime(loadedData.beginDateTime)} ~ ${formatDisplayDateTime(loadedData.endDateTime)}`
        )
      }


    } catch (error) {

      console.error('Error fetching report:', error)
    } finally {
      setLoading(false);
    }
  }

const excelExport = () => {
  if (!reportData || reportData.length === 0) {
    alert('沒有可匯出的資料');
    return;
  }

  const headerRow0 = [`日期區間:${searchTimeRange || ''}`];
  const headerRow1 = ['台灣順豐公司行程明細表'];

  const headerRow2 = [
    '基本資料', '', '',
    '啟動', '', '',
    '熄火', '', '',
    '行駛',
    '運行',
    '停留'
  ];

  const headerRow3 = [
    '車號', '日期', '序號',
    '時間', '區域', '地址',
    '時間', '區域', '地址',
    '距離(KM)',
    '時間(min)',
    '時間(min)'
  ];

  // Group by CarNo + TripDate
  const groupMap = new Map();

  reportData.forEach((row) => {
    const key = `${row.CarNo ?? ''}__${row.TripDate ?? ''}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(row);
  });

  const dataRows = [];

  for (const [, rows] of groupMap) {
    let totalDistance = 0;
    let totalDrivingTime = 0;
    let totalStayTime = 0;

    rows.forEach((row) => {
      const distance = Number(row.TotalDistance) || 0;
      const drivingTime = Number(row.TotalDrivingTime) || 0;
      const stayTime = Number(row.StayTime) || 0;

      totalDistance += distance;
      totalDrivingTime += drivingTime;
      totalStayTime += stayTime;

      dataRows.push([
        row.CarNo ?? '',
        row.TripDate ?? '',
        row.seq ?? '',
        row.BeginTime ?? '',
        row.BegArea ?? '',
        row.BegAddress ?? '',
        row.EndTime ?? '',
        row.EndArea ?? '',
        row.EndAddress ?? '',
        distance || '',
        drivingTime || '',
        stayTime || ''
      ]);
    });

    dataRows.push([
      '合計', '', '', '', '', '', '', '', '',
      Number(totalDistance.toFixed(2)),
      Number(totalDrivingTime.toFixed(2)),
      Number(totalStayTime.toFixed(2))
    ]);
  }

  const wsData = [headerRow0, headerRow1, headerRow2, headerRow3, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Merge cells
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, // 日期區間
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } }, // 標題
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },  // 基本資料
    { s: { r: 2, c: 3 }, e: { r: 2, c: 5 } },  // 啟動
    { s: { r: 2, c: 6 }, e: { r: 2, c: 8 } },  // 熄火
    { s: { r: 2, c: 9 }, e: { r: 2, c: 9 } },  // 行駛
    { s: { r: 2, c: 10 }, e: { r: 2, c: 10 } }, // 運行
    { s: { r: 2, c: 11 }, e: { r: 2, c: 11 } }  // 停留
  ];

  // Merge total rows A:I
  let currentRowIndex = 4; // data starts from row index 4 (Excel row 5)
  for (const [, rows] of groupMap) {
    currentRowIndex += rows.length;
    worksheet['!merges'].push({
      s: { r: currentRowIndex, c: 0 },
      e: { r: currentRowIndex, c: 8 }
    });
    currentRowIndex += 1;
  }

  // Column widths
  worksheet['!cols'] = [
    { wch: 12 }, // 車號
    { wch: 12 }, // 日期
    { wch: 8 },  // 序號
    { wch: 20 }, // 啟動時間
    { wch: 12 }, // 啟動區域
    { wch: 35 }, // 啟動地址
    { wch: 20 }, // 熄火時間
    { wch: 12 }, // 熄火區域
    { wch: 35 }, // 熄火地址
    { wch: 12 }, // 距離
    { wch: 12 }, // 運行
    { wch: 12 }  // 停留
  ];

  // Optional: simple alignment only, no fill color
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!worksheet[cellRef]) continue;

      worksheet[cellRef].s = {
        alignment: {
          vertical: 'center',
          horizontal:
            R <= 3 || C === 0 || C === 1 || C === 2 || C >= 9
              ? 'center'
              : 'left',
          wrapText: true
        }
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

  XLSX.writeFile(workbook, 'report.xlsx');
};

  const handleExport = async () => {
    if (!reportData?.length) {
      toast.current.show({ severity: 'warn', summary: 'Warning', detail: '請先選擇檢視報表', life: 3000 });

      return;
    }
    await excelExport();
  }

  return (
    <div className="report-container">
      <Toast ref={toast} position="top-center" />
      <h1 className="title">車輛行程明細報表</h1>

      <div className="filter-section">

        <div className="grid">
          <div className="col-4">
            <label>車隊</label>
            <MultiSelect
              ref={fleetsRef}
              name="fleets"
              display="chip"
              className="w-full md:h-3rem"
              value={filters.fleets}
              onChange={(selected) => {
                setFilters(prev => ({
                  ...prev,
                  fleets: selected.value,
                  cars: []
                }))
              }
              }
              disabled={loadingFleets}
              onFocus={() => {
                carsRef.current?.hide();
                if (!fleets?.length)
                  fetchFleets();
              }}
              filter loading={loadingFleets} placeholder={loadingFleets ? "載入中..." : "請選擇車隊"}
              options={loadingFleets ? [] : fleets}
            />
          </div>
          <div className="col-4">
            <label >車號</label>
            <MultiSelect
              ref={carsRef}
              className="w-full md:h-3rem"
              display="chip"
              name="cars"
              value={filters.cars}
              onChange={(selected) => {
                skipCarsFocusRef.current = true;
                setFilters(prev => ({
                  ...prev,
                  cars: selected.value
                }))
              }
              }
              onFocus={() => {
                if (skipCarsFocusRef.current) {
                  skipCarsFocusRef.current = false;
                  return;
                }
                if (filters.fleets?.length) {
                  fetchCarsByFleetIds(filters.fleets);
                }
              }}
              placeholder={loadingCars ? "載入中..." : "請選擇車號"}
              disabled={!filters.fleets?.length || loadingCars}
              options={loadingCars ? [] : carsByFleetIds.map(c => ({ label: c.label, value: c.value }))}
              loading={loadingCars}
            />
          </div>
          <div className="col-4">
            <label className="text-xs">此表僅供最近3個月內資料。如您需要歷史資料。請聯繫Line ID:</label>
            <IconField>
              <InputText placeholder="請先選車號" value={filters.cars.length > 0 ? "@fnq8156k" : ""} disabled className="w-full md:h-3rem" />
            </IconField>
          </div>
          <div className="col-3">
            <label htmlFor="startDate">開始日期</label>
            <Calendar value={filters.startDate} onChange={(e) => {
              setFilters(prev => ({
                ...prev,
                startDate: e.value
              }))

            }} minDate={minDate} maxDate={today} readOnlyInput showIcon dateFormat="yy/mm/dd" className="w-full md:h-3rem" />
          </div>
          <div className="col-3">
            <label htmlFor="startTime">開始時間</label>
            <Dropdown value={filters.startTime} onChange={(e) => {
              setFilters(prev => ({
                ...prev,
                startTime: e.value
              }))

            }} options={hours.map(h => ({ name: h, code: h }))} optionLabel="name"
              placeholder="請選擇時間" className="w-full md:h-3rem" checkmark={true} highlightOnSelect={false} />



          </div>
          <div className="col-3">
            <label htmlFor="endDate">
              結束日期
            </label>
            <Calendar value={filters.endDate} onChange={(e) => {
              setFilters(prev => ({
                ...prev,
                endDate: e.value
              }))
            }} minDate={minDate} maxDate={today} readOnlyInput showIcon dateFormat="yy/mm/dd" className="w-full md:h-3rem" />
          </div>
          <div className="col-3">
            <label htmlFor="endTime">結束時間</label>
            <Dropdown value={filters.endTime} onChange={(e) => {
              setFilters(prev => ({
                ...prev,
                endTime: e.value
              }))
            }} options={hours.map(h => ({ name: h, code: h }))} optionLabel="name"
              placeholder="請選擇時間" className="w-full md:h-3rem" checkmark={true} highlightOnSelect={false} />


          </div>


          <div className='col-1'></div>
          <div className="col-10">
            <div className='justify-content-center flex card'>
              <Button label={loading ? (
                <>
                  <i className="pi pi-spin pi-spinner"></i><span className="m-2">載入中</span>
                </>
              ) : (<><i className="pi pi-eye" ></i><span className="m-2">檢視報表</span></>)} raised onClick={loadData} disabled={loading} />
            </div>
          </div>
          <div className='col-1'>
            <Button severity="success" label={
              (<><i className="pi pi-file-excel" ></i><span className="m-1">匯出Excel</span></>)} outlined onClick={handleExport} disabled={loading} />
          </div>

        </div>
      </div>

      <div className="result-section shadow-sm">
        <div className="grid">
          <div className="col-10 mb-3">
            {hasSearched && <span className="date-range-display">日期區間: {searchTimeRange}</span>}

          </div>
          <div className="col-12">
            <ReportTable header={tableHeader} reportData={reportData} loading={loading} /></div>
        </div>
      </div>
    </div>
  )
}

export default App


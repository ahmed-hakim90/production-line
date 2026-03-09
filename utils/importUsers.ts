import * as XLSX from 'xlsx';

export interface ParsedUserImportRow {
  rowIndex: number;
  displayName: string;
  email: string;
  password: string;
  roleNameOrId: string;
  employeeCode: string;
  errors: string[];
}

export interface UsersImportParseResult {
  rows: ParsedUserImportRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

const HEADER_MAP: Record<string, keyof Omit<ParsedUserImportRow, 'rowIndex' | 'errors'>> = {
  'الاسم': 'displayName',
  'اسم المستخدم': 'displayName',
  'displayname': 'displayName',
  'display name': 'displayName',
  'name': 'displayName',

  'البريد': 'email',
  'البريد الالكتروني': 'email',
  'البريد الإلكتروني': 'email',
  'email': 'email',

  'كلمة المرور': 'password',
  'password': 'password',

  'الدور': 'roleNameOrId',
  'role': 'roleNameOrId',
  'roleid': 'roleNameOrId',
  'role id': 'roleNameOrId',

  'كود الموظف': 'employeeCode',
  'employee code': 'employeeCode',
  'employeecode': 'employeeCode',
  'code': 'employeeCode',
};

function normalizeHeader(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function parseUsersImportFile(
  file: File,
  existingEmails: string[],
): Promise<UsersImportParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (rawRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
          return;
        }

        const existing = new Set(existingEmails.map(normalizeEmail));
        const inFile = new Set<string>();

        const rows: ParsedUserImportRow[] = rawRows.map((raw, idx) => {
          const errors: string[] = [];
          const mapped: Record<string, string> = {
            displayName: '',
            email: '',
            password: '',
            roleNameOrId: '',
            employeeCode: '',
          };

          Object.entries(raw).forEach(([key, value]) => {
            const field = HEADER_MAP[normalizeHeader(key)];
            if (!field) return;
            mapped[field] = String(value ?? '').trim();
          });

          const email = normalizeEmail(mapped.email);
          if (!mapped.displayName) errors.push('الاسم مطلوب');
          if (!email) errors.push('البريد الإلكتروني مطلوب');
          if (email && !email.includes('@')) errors.push('صيغة البريد الإلكتروني غير صحيحة');
          if (!mapped.password) errors.push('كلمة المرور مطلوبة');
          if (mapped.password && mapped.password.length < 6) errors.push('كلمة المرور أقل من 6 أحرف');
          if (!mapped.roleNameOrId) errors.push('الدور مطلوب');
          if (email && existing.has(email)) errors.push('البريد موجود بالفعل في النظام');
          if (email && inFile.has(email)) errors.push('البريد مكرر داخل ملف الاستيراد');

          if (email) inFile.add(email);

          return {
            rowIndex: idx + 2,
            displayName: mapped.displayName,
            email,
            password: mapped.password,
            roleNameOrId: mapped.roleNameOrId,
            employeeCode: mapped.employeeCode,
            errors,
          };
        });

        const validCount = rows.filter((row) => row.errors.length === 0).length;
        resolve({
          rows,
          totalRows: rows.length,
          validCount,
          errorCount: rows.length - validCount,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الاستيراد'));
    reader.readAsArrayBuffer(file);
  });
}


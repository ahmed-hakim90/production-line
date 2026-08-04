import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { customerService } from '../services/customerService';
import { customerActivityService } from '../services/customerActivityService';
import { CUSTOMER_TYPE_LABELS, type Customer, type CustomerActivity } from '../types';

export const CustomerDetail: React.FC = () => {
  const { tenantSlug, customerId } = useParams<{ tenantSlug?: string; customerId: string }>();
  const { can } = usePermission();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!customerId) return;
      setLoading(true);
      setError('');
      try {
        const [row, timeline] = await Promise.all([
          customerService.getById(customerId),
          customerActivityService.listForCustomer(customerId, 100),
        ]);
        if (cancelled) return;
        if (!row) {
          setError('العميل غير موجود.');
          setCustomer(null);
          setActivities([]);
        } else {
          setCustomer(row);
          setActivities(timeline);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'تعذر تحميل العميل.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!can('customers.view')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية عرض العملاء.</div>;
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جاري التحميل…</div>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-rose-700">{error || 'العميل غير موجود.'}</p>
        <Button asChild variant="outline">
          <Link to={withTenantPath(tenantSlug, '/customers')}>العودة للقائمة</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${customer.code} — ${customer.name}`}
        subtitle="بطاقة عميل الماستر وسجل الحركات عبر الموديولات"
        actions={
          <Button asChild variant="outline">
            <Link to={withTenantPath(tenantSlug, '/customers')}>كل العملاء</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>بيانات الماستر</CardTitle>
            <CardDescription>مصدر الحقيقة لبيانات العميل</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">الكود</div>
              <div className="font-medium tabular-nums">{customer.code}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">النوع</div>
              <div className="font-medium">{CUSTOMER_TYPE_LABELS[customer.type]}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">الهاتف</div>
              <div className="font-medium tabular-nums">{customer.phone}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">العنوان</div>
              <div className="font-medium">{customer.address || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">ملاحظات</div>
              <div className="font-medium whitespace-pre-wrap">{customer.notes || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">الحالة</div>
              <StatusBadge
                type={customer.isActive !== false ? 'success' : 'muted'}
                label={customer.isActive !== false ? 'نشط' : 'غير نشط'}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>سجل الحركات</CardTitle>
            <CardDescription>
              صيانة وأي موديول لاحق — كل حدث مرتبط بهذا العميل يظهر هنا.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد حركات مسجّلة بعد.</p>
            ) : (
              <ol className="relative border-s border-border ms-2 space-y-4">
                {activities.map((activity) => (
                  <li key={activity.id} className="ms-4">
                    <div className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border bg-background" />
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {activity.at ? new Date(activity.at).toLocaleString('ar-EG') : '—'}
                      {' · '}
                      {activity.module}
                    </div>
                    <div className="font-medium text-sm">{activity.title}</div>
                    {activity.summary && (
                      <div className="text-sm text-muted-foreground">{activity.summary}</div>
                    )}
                    {activity.referenceLabel && (
                      <div className="text-xs mt-1">
                        مرجع: {activity.referenceLabel}
                        {activity.referenceId && activity.module === 'repair' ? (
                          <>
                            {' '}
                            <Link
                              className="text-primary hover:underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${activity.referenceId}`)}
                            >
                              فتح
                            </Link>
                          </>
                        ) : null}
                      </div>
                    )}
                    {activity.actorName && (
                      <div className="text-xs text-muted-foreground mt-0.5">بواسطة: {activity.actorName}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

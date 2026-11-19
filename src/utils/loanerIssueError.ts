const fields: Record<string, { label: string; section: number }> = {
  'customer.name': { label: 'Customer full name', section: 1 },
  'customer.dob': { label: 'Customer birth year', section: 1 },
  'customer.mobile': { label: 'Mobile phone number', section: 1 },
  'customer.email': { label: 'Email address', section: 1 },
  'customer.residentialAddress': { label: 'Residential address', section: 1 },
  'customer.licenceNumber': { label: 'Driver licence number', section: 1 },
  'customer.licenceState': { label: 'Licence state', section: 1 },
  'customer.licenceExpiry': { label: 'Driver licence expiry date', section: 1 },
  'customer.licenceSighted': { label: 'Licence sighting confirmation', section: 1 },
  'vehicle.rego': { label: 'Vehicle registration', section: 2 },
  'vehicle.make': { label: 'Vehicle make', section: 2 },
  'vehicle.model': { label: 'Vehicle model', section: 2 },
  'vehicle.year': { label: 'Vehicle year', section: 2 },
  'vehicle.vin': { label: 'Vehicle VIN', section: 2 },
  dueBackDateTime: { label: 'Expected return date and time', section: 2 },
  'outbound.odometerOut': { label: 'Outbound odometer reading', section: 3 },
};

export function getLoanerIssueError(error: unknown) {
  const failure = error as { statusCode?: number; data?: { message?: unknown }; message?: unknown } | null;
  const raw = failure?.data?.message ?? failure?.message;
  const messages = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/,\s*/) : [];
  const matched = [...new Set(messages.flatMap(message => {
    if (typeof message !== 'string') return [];
    const field = message.trim().split(/\s/)[0];
    return fields[field] ? [field] : [];
  }))];

  if (matched.length) {
    return {
      title: 'Please check these details',
      message: 'Please complete or correct the following before issuing the vehicle:\n\n' +
        matched.map(field => `\u2022 ${fields[field].label} (Section ${fields[field].section})`).join('\n'),
      sections: [...new Set(matched.map(field => fields[field].section))],
    };
  }

  const status = failure?.statusCode;
  let message = 'We couldn\'t issue the vehicle. Please try again. If the problem continues, contact your administrator.';
  if (status === 400 || status === 422) {
    message = 'Some agreement details are missing or invalid. Please review the customer, vehicle and handover details, then try again.';
  } else if (status === 401) {
    message = 'Your session has expired. Please sign in again and retry.';
  } else if (status === 403) {
    message = 'You do not have permission to issue this vehicle. Please contact your administrator.';
  } else if (status === 409) {
    message = 'The vehicle or reservation details have changed. Please refresh the loaner list and check its availability before trying again.';
  } else if (!status && /fetch|network|offline|timed?\s*out|timeout/i.test(String(raw))) {
    message = 'We couldn\'t confirm whether the vehicle was issued. Please check your connection and the loaner list before trying again.';
  }
  return { title: 'Unable to issue vehicle', message, sections: [] as number[] };
}

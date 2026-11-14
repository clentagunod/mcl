import { FormField } from './FormField';
import { VALID_ID_TYPES, type ClientIdentityFormValues } from '../lib/client-identity';
import type { FieldErrors } from '../lib/validation';

interface Props {
  values: ClientIdentityFormValues;
  errors: FieldErrors<ClientIdentityFormValues>;
  onChange: (field: keyof ClientIdentityFormValues, value: string) => void;
  coMaker?: boolean;
}

/** Kept shared so Clients and Print Studio offer identical identity inputs. */
export function ClientIdentityFields({ values, errors, onChange, coMaker = false }: Props) {
  const fields = coMaker
    ? { type: 'coMakerValidIdType', custom: 'coMakerCustomValidIdType', number: 'coMakerValidIdNumber', on: 'coMakerValidIdIssuedOn', at: 'coMakerValidIdIssuedAt' } as const
    : { type: 'validIdType', custom: 'customValidIdType', number: 'validIdNumber', on: 'validIdIssuedOn', at: 'validIdIssuedAt' } as const;
  const bind = (field: keyof ClientIdentityFormValues) => ({
    value: values[field] ?? '',
    onChange: (event: { target: { value: string } }) => onChange(field, event.target.value),
  });
  return <div className="form-grid">
    {coMaker && <FormField label="Name" error={errors.coMakerName}>
      <input type="text" autoComplete="off" maxLength={200} {...bind('coMakerName')} />
    </FormField>}
    <FormField label="Valid ID type" error={errors[fields.type]}>
      <select {...bind(fields.type)}>
        <option value="">Select an ID type (optional)</option>
        {VALID_ID_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
        <option value="custom">Custom (please specify)</option>
      </select>
    </FormField>
    {values[fields.type] === 'custom' && <FormField label="Custom ID type (please specify)" error={errors[fields.custom]}>
      <input type="text" autoComplete="off" maxLength={200} {...bind(fields.custom)} />
    </FormField>}
    <FormField label="Valid ID No." error={errors[fields.number]}>
      <input type="text" autoComplete="off" maxLength={200} {...bind(fields.number)} />
    </FormField>
    <FormField label="Issued on" error={errors[fields.on]}>
      <input type="date" {...bind(fields.on)} />
    </FormField>
    <FormField label="Issued at" error={errors[fields.at]}>
      <input type="text" autoComplete="off" maxLength={300} {...bind(fields.at)} />
    </FormField>
    {coMaker && <FormField label="Contact number" error={errors.coMakerContactNumber} hint="Leave blank or enter N/A if unavailable.">
      <input type="tel" autoComplete="off" placeholder="09171234567 or N/A" {...bind('coMakerContactNumber')} />
    </FormField>}
  </div>;
}

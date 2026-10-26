import { Prisma, AttendanceStatus, WageType } from '../database/index.js';
import { BadRequestError } from './errors.js';
import { ErrorCode } from '../shared/index.js';

/**
 * Exact monetary rounding rule: Round Half-Up (ROUND_HALF_UP) to 2 decimal places.
 * Guarantees zero JavaScript floating-point inaccuracies.
 */
export function roundHalfUp(
  val: Prisma.Decimal | number | string,
  decimalPlaces: number = 2
): Prisma.Decimal {
  const dec = val instanceof Prisma.Decimal ? val : new Prisma.Decimal(val);
  return dec.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

export interface WageCalculationResult {
  payableUnits: Prisma.Decimal;
  hoursWorked: Prisma.Decimal | null;
  grossWage: Prisma.Decimal;
}

/**
 * Calculates gross earned wage for an attendance record based on the applicable rate
 */
export function calculateGrossWage(
  wageType: WageType,
  rate: Prisma.Decimal | number | string,
  status: AttendanceStatus,
  hoursWorkedInput?: Prisma.Decimal | number | string | null
): WageCalculationResult {
  const decimalRate = rate instanceof Prisma.Decimal ? rate : new Prisma.Decimal(rate);

  if (status === AttendanceStatus.ABSENT) {
    if (hoursWorkedInput !== undefined && hoursWorkedInput !== null && hoursWorkedInput !== '') {
      const numHours = Number(hoursWorkedInput);
      if (numHours > 0) {
        throw new BadRequestError(
          'ABSENT attendance must not have hours worked.',
          ErrorCode.INVALID_HOURS
        );
      }
    }
    return {
      payableUnits: new Prisma.Decimal('0.00'),
      hoursWorked: null,
      grossWage: new Prisma.Decimal('0.00'),
    };
  }

  if (wageType === WageType.DAILY) {
    // DAILY workers must NOT accept arbitrary hours worked
    if (hoursWorkedInput !== undefined && hoursWorkedInput !== null && hoursWorkedInput !== '') {
      throw new BadRequestError(
        'DAILY attendance must not accept arbitrary worked hours.',
        ErrorCode.INVALID_HOURS
      );
    }

    if (status === AttendanceStatus.PRESENT) {
      const payableUnits = new Prisma.Decimal('1.00');
      const grossWage = roundHalfUp(decimalRate.mul(payableUnits));
      return {
        payableUnits,
        hoursWorked: null,
        grossWage,
      };
    }

    if (status === AttendanceStatus.HALF_DAY) {
      const payableUnits = new Prisma.Decimal('0.50');
      const grossWage = roundHalfUp(decimalRate.mul(payableUnits));
      return {
        payableUnits,
        hoursWorked: null,
        grossWage,
      };
    }
  }

  if (wageType === WageType.HOURLY) {
    if (status === AttendanceStatus.HALF_DAY) {
      throw new BadRequestError(
        'HALF_DAY status is not supported for HOURLY workers. Specify actual hours worked or mark ABSENT.',
        ErrorCode.VALIDATION_ERROR
      );
    }

    if (hoursWorkedInput === undefined || hoursWorkedInput === null || hoursWorkedInput === '') {
      throw new BadRequestError(
        'HOURLY attendance requires positive worked hours up to 24.',
        ErrorCode.INVALID_HOURS
      );
    }

    const hours = roundHalfUp(hoursWorkedInput, 2);
    if (hours.lte(0) || hours.gt(24)) {
      throw new BadRequestError(
        'HOURLY attendance must use positive decimal hours, at most two decimal places, up to 24 hours.',
        ErrorCode.INVALID_HOURS
      );
    }

    const payableUnits = hours;
    const grossWage = roundHalfUp(decimalRate.mul(payableUnits));
    return {
      payableUnits,
      hoursWorked: hours,
      grossWage,
    };
  }

  throw new BadRequestError('Invalid wage type or attendance status combination.');
}

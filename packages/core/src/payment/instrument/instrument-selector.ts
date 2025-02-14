import { memoizeOne } from '@bigcommerce/memoize';
import { filter, flatMap, isMatch, values } from 'lodash';

import { MissingDataError, MissingDataErrorType } from '../../common/error/errors';
import { createSelector } from '../../common/selector';
import { guard } from '../../common/utility';
import PaymentMethod from '../payment-method';

import PaymentInstrument, { CardInstrument } from './instrument';
import InstrumentState, { DEFAULT_STATE, InstrumentMeta } from './instrument-state';
import supportedInstruments from './supported-payment-instruments';

export default interface InstrumentSelector {
    getCardInstrument(instrumentId: string): CardInstrument | undefined;
    getCardInstrumentOrThrow(instrumentId: string): CardInstrument;
    getInstruments(): PaymentInstrument[] | undefined;
    getInstrumentsByPaymentMethod(paymentMethod: PaymentMethod): PaymentInstrument[] | undefined;
    getInstrumentsMeta(): InstrumentMeta | undefined;
    getLoadError(): Error | undefined;
    getDeleteError(instrumentId?: string): Error | undefined;
    isLoading(): boolean;
    isDeleting(instrumentId?: string): boolean;
}

export type InstrumentSelectorFactory = (state: InstrumentState) => InstrumentSelector;

export function createInstrumentSelectorFactory(): InstrumentSelectorFactory {
    const getInstrumentsByPaymentMethod = createSelector(
        (state: InstrumentState) => state.data,
        instruments => (paymentMethod: PaymentMethod) => {
            if (!instruments) {
                return;
            }

            const paymentMethodKey = paymentMethod.gateway ? `${paymentMethod.gateway}.${paymentMethod.id}` : paymentMethod.id;

            const currentMethod = supportedInstruments[paymentMethodKey];

            if (!currentMethod) {
                return [];
            }

            return filter<PaymentInstrument>(instruments, currentMethod);
        }
    );

    const getCardInstrument = createSelector(
        (state: InstrumentState) => state.data,
        (instruments = []) => (instrumentId: string) => {
            const cards = values(supportedInstruments);

            return instruments?.find((instrument): instrument is CardInstrument =>
                instrument.bigpayToken === instrumentId &&
                instrument.type === 'card' &&
                cards.some(card => isMatch(instrument, card))
            );
        }
    );

    const getCardInstrumentOrThrow = createSelector(
        getCardInstrument,
        getCardInstrument => (instrumentId: string) => {
            return guard(getCardInstrument(instrumentId), () => new MissingDataError(MissingDataErrorType.MissingPaymentInstrument));
        }
    );

    const getInstruments = createSelector(
        (state: InstrumentState) => state.data,
        instruments => () => {
            if (!instruments) {
                return;
            }

            const allSupportedInstruments = flatMap(supportedInstruments, supportedProvider =>
                filter(instruments, (instrument: PaymentInstrument): instrument is PaymentInstrument => {
                    return isMatch(instrument, supportedProvider);
                })
            );

            return allSupportedInstruments;
        }
    );

    const getInstrumentsMeta = createSelector(
        (state: InstrumentState) => state.meta,
        meta => () => meta
    );

    const getLoadError = createSelector(
        (state: InstrumentState) => state.errors.loadError,
        loadError => () => loadError
    );

    const getDeleteError = createSelector(
        (state: InstrumentState) => state.errors.failedInstrument,
        (state: InstrumentState) => state.errors.deleteError,
        (failedInstrument, deleteError) => (instrumentId?: string) => {
            if (instrumentId && failedInstrument !== instrumentId) {
                return;
            }

            return deleteError;
        }
    );

    const isLoading = createSelector(
        (state: InstrumentState) => state.statuses.isLoading,
        isLoading => () => !!isLoading
    );

    const isDeleting = createSelector(
        (state: InstrumentState) => state.statuses.deletingInstrument,
        (state: InstrumentState) => state.statuses.isDeleting,
        (deletingInstrument, isDeleting) => (instrumentId?: string) => {
            if (instrumentId && deletingInstrument !== instrumentId) {
                return false;
            }

            return !!isDeleting;
        }
    );

    return memoizeOne((
        state: InstrumentState = DEFAULT_STATE
    ): InstrumentSelector => {
        return {
            getCardInstrument: getCardInstrument(state),
            getCardInstrumentOrThrow: getCardInstrumentOrThrow(state),
            getInstruments: getInstruments(state),
            getInstrumentsByPaymentMethod: getInstrumentsByPaymentMethod(state),
            getInstrumentsMeta: getInstrumentsMeta(state),
            getLoadError: getLoadError(state),
            getDeleteError: getDeleteError(state),
            isLoading: isLoading(state),
            isDeleting: isDeleting(state),
        };
    });
}

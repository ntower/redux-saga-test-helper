import equals from 'ramda/src/equals';

type Responder = <T>(iterator: Iterator<T>) => IteratorResult<T>;

type ConditionMatcher = (value: any, allValues: any) => boolean;

const logPrefix = '[rsth]: ';
const colorInfo = "\x1b[37m" // white;
// const colorWarning = "'\x1b[33m%s\x1b[0m'" // yellow
// const colorError = "\x1b[41m"// white

const logInfo = (message: string) => console.log(colorInfo, logPrefix, message);
// const logWarning = (message: string) => console.log(colorWarning, logPrefix, message);
// const logError = (message: string) => console.log(colorError, logPrefix, message);

export interface MinimalMock {
  match: ConditionMatcher;
  execute: (iterator: Iterator<any>) => IteratorResult<any>;
}

export interface Mock extends MinimalMock{
  next: (value?: any) => this;
  throw: (value?: any) => this;
  return: (value?: any) => this;
  then: (callback: Responder) => this;
}

type BoundRunUntil = ( 
  iteratorOrGenerator: Iterator<any> | GeneratorFunction, 
  mocks?: MinimalMock[], 
  debug?: boolean
) => any[];

function runUntil(breakCondition: ConditionMatcher): BoundRunUntil;
function runUntil(  
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: Iterator<any> | GeneratorFunction,
  mocks?: MinimalMock[],
  debug?: boolean): any[]
function runUntil(
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: Iterator<any> | GeneratorFunction,
  mocks: MinimalMock[] = [],
  debug = false
): BoundRunUntil | any[] {
  if (iteratorOrGenerator === undefined) {
    return runUntil.bind(null, breakCondition);
  }

  mocks = mocks || [];
  const iterator = typeof iteratorOrGenerator === 'function' ? iteratorOrGenerator() : iteratorOrGenerator;
  if (!iterator || typeof iterator.next !== 'function') {
    throw new Error('Requires an iterator or generator to work');
  }

  if (debug) {
    logInfo('VVV Starting VVV');
  }

  const yieldedValues: any[] = [];
  let result = iterator.next();
  while (!result.done) {
    yieldedValues.push(result.value);
    if (breakCondition(result.value, yieldedValues)) {
      if (debug) {
        logInfo('Reached break condition. Stopping iteration.')
      }
      break;
    }

    const matchingMock = mocks.find(m => m.match(result.value, yieldedValues));
    if (matchingMock) {
      result = matchingMock.execute(iterator);
      if (!result) {
        throw new Error('Got no iterator result. If you are implementing a custom .then, make sure to return the result.')
      }
    } else {
      result = iterator.next();
    }
  }

  if (debug) {
    logInfo('^^^ Stopping ^^^');
  }

  return yieldedValues;
}

export const runUntilCompletion = runUntil(() => false);

const cutoff = 1000;

export const run = runUntil((_, allValues) => {
  if (allValues.length > cutoff) {
    throw new Error(
`Generator did not terminate after ${cutoff} yields. You may have an infinite loop.
If you need to run longer, use runUntilCompletion to run forever or runUntil to specify custom logic.`
    );
  }
  return true;
})

type ActionPicker = (actions: Responder[]) => Responder;

function createMock(actionPicker: ActionPicker, valueOrMatcher: any): Mock {
  let matcher: ConditionMatcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const responders: Responder[] = [];

  const mock: Mock = {
    match: (val, allValues) => responders.length > 0 && matcher(val, allValues),
    execute: (iterator) => {
      return actionPicker(responders)(iterator);
    },
    then: function (callback: Responder) {
      responders.push(callback);
      return this;
    },
    next: function (mockValue) {
      return this.then(iterator => iterator.next(mockValue));
    },
    throw: function (mockValue) {
      return this.then(iterator => iterator.throw!(mockValue));
    },
    return: function (mockValue) {
      return this.then(iterator => iterator.return!(mockValue));
    },
  }

  return mock;
}

export const when = (valueOrMatcher: any) => createMock((responders: Responder[]) => responders.shift()!, valueOrMatcher);

export const whenever = (valueOrMatcher: any) => createMock((responders: Responder[]) => responders[0], valueOrMatcher);
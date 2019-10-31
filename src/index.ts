import equals from 'ramda/src/equals';

type Responder = <T>(iterator: Iterator<T>) => IteratorResult<T>;

type ConditionMatcher = (value: any, allValues: any) => boolean;

const logPrefix = '[rsth]: ';
const colorInfo = "\x1b[37m" // white;
const colorWarning = "'\x1b[33m%s\x1b[0m'" // yellow
const colorError = "\x1b[41m" // red

const logInfo = (...messages: string[]) => console.log(colorInfo, logPrefix, ...messages);
const logWarning = (...messages: string[]) => console.log(colorWarning, logPrefix, ...messages);
const logError = (...messages: string[]) => console.log(colorError, logPrefix, ...messages);

export interface Mock {
  _match: ConditionMatcher;
  _execute: (iterator: Iterator<any>) => IteratorResult<any>;
  next: (value?: any) => this;
  throw: (value?: any) => this;
  return: (value?: any) => this;
  respond: (callback: Responder) => this;
  getResponsesRemaining: () => number;
  getResponseCount: () => number;
  hasResponded: () => boolean;
  toString: () => string;
}

interface RunOptions {
  debug?: boolean;
  silent?: boolean;
}

type IteratorOrGenerator = Iterator<any> | (() => Iterator<any>)

type BoundRunUntil = ( 
  iteratorOrGenerator: IteratorOrGenerator, 
  mocks?: Mock[], 
  options?: RunOptions
) => any[];

export function runUntil(breakCondition: ConditionMatcher): BoundRunUntil;
export function runUntil(  
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: IteratorOrGenerator,
  mocks?: Mock[],
  options?: RunOptions): any[]
export function runUntil(
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: IteratorOrGenerator,
  mocks: Mock[] = [],
  options = {} as Partial<RunOptions>
): BoundRunUntil | any[] {
  if (iteratorOrGenerator === undefined) {
    return runUntil.bind(null, breakCondition);
  }

  const {
    debug = false,
    silent = false,
  } = options;

  mocks = mocks || [];
  const iterator = typeof iteratorOrGenerator === 'function' ? iteratorOrGenerator() : iteratorOrGenerator;
  if (!iterator || typeof iterator.next !== 'function') {
    if (!silent) {
      logError(
        'Requires an iterator or generator to work. Received:', 
        iteratorOrGenerator && iteratorOrGenerator.toString && iteratorOrGenerator.toString()
      )
    }
    return [];
  }

  if (debug && !silent) {
    logInfo('VVV Starting VVV');
  }

  if (!silent) {
    const exhaustedMocks: number[] = [];
    mocks.forEach((mock, index) => {
      if (mock.getResponsesRemaining() <= 0) {
        exhaustedMocks.push(index);
      }
    })
    const len = exhaustedMocks.length;
    if (len > 0) {
      logWarning(
  `${len} mock${len === 1 ? '' : 's'} were already used up before the test started.
  This may mean you are trying to reuse mocks between tests.
  "when" mocks are one-time use. Either make new mocks for each test, or use "whenever".
  ${exhaustedMocks.map(mockIndex => 
    `at index ${mockIndex}: ${mocks[mockIndex].toString()}`
  ).join('\n')}`);
    }
  }

  const yieldedValues: any[] = [];
  let result = iterator.next();
  while (!result.done) {
    yieldedValues.push(result.value);
    if (breakCondition(result.value, yieldedValues)) {
      if (debug && !silent) {
        logInfo('Reached break condition before the saga could return. Stopping iteration.')
      }
      break;
    }

    const matchingMock = mocks.find(m => m._match(result.value, yieldedValues));
    if (matchingMock) {
      result = matchingMock._execute(iterator);
      if (!result) {
        if (!silent) {
          logError('Got no iterator result. If you are implementing a custom .then, make sure to return the result.')
        }
        return yieldedValues;
      }
    } else {
      result = iterator.next();
    }
  }

  if (!silent) {
    const unusedMocks: number[] = [];
    mocks.forEach((mock, index) => {
      if (!mock.hasResponded()) {
        unusedMocks.push(index);
      }
    })
    const len = unusedMocks.length;
    if (len > 0) {
      logWarning(
  `${len} mock${len === 1 ? '' : 's'} never matched any yielded value
  ${unusedMocks.map(mockIndex => 
    `at index ${mockIndex}: ${mocks[mockIndex].toString()}`
  ).join ('\n')}`);
    }
  }

  if (debug && !silent) {
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
  return false;
});

function createMock(isSingleUse: boolean, valueOrMatcher: any): Mock {
  let matcher: ConditionMatcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const responders: Responder[] = [];
  let responseCount = 0;

  const mock: Mock = {
    toString: () => {
      const name = isSingleUse ? 'when' : 'whenever';
      let matcher;
      if (typeof valueOrMatcher === 'function') {
        matcher = '[custom matcher]';
      } else if (valueOrMatcher['@@redux-saga/IO']) {
        // TODO: i think '@@redux-saga/IO' only works with redux-saga 1.0 or later.
        //   See about supporting earlier versions too
        matcher = valueOrMatcher.type + ' effect';
      }
      return `${name}(${matcher})` + responders.map(r => r.toString()).join('');
    },
    getResponseCount: () => responseCount,
    getResponsesRemaining: () => {
      if (isSingleUse) {
        return responders.length - responseCount;
      }
      return Infinity;
    },
    hasResponded: () => responseCount > 0,
    _match: (val, allValues) => responders.length > 0 && matcher(val, allValues),
    _execute: (iterator) => {
      responseCount++;
      const responder = responders[0];
      if (isSingleUse) {
        responders.shift();
      }
      return responder(iterator);
    },
    respond: function (callback: Responder) {
      responders.push(callback);
      if (!isSingleUse && responders.length > 1) {
        logWarning(
`Chaining multiple responses onto a "whenever" mock has no effect. The first response will be used forever.

You can chain multiple responses onto a when, with each response occuring at most once:
when(call(someFunction))
  .throw("first time fails")
  .next("second time succeeds");
  // third and later, the mock does nothing. The saga resumes with undefined

If you need more control you can use whenever with a custom .respond:
let count = 0;
whenever(call(someFunction))
  .respond(iterator => {
    count++;
    if (count === 1) {
      return iterator.throw("first time fails");
    }
    return iterator.next("all other times succeed");
  })`);
      }
      return this;
    },
    next: function (mockValue) {
      const responder: Responder = iterator => iterator.next(mockValue);
      responder.toString = () => `.next(${mockValue && mockValue.toString && mockValue.toString()})`;
      return this.respond(responder);
    },
    throw: function (mockValue) {
      const responder: Responder = iterator => iterator.throw!(mockValue);
      responder.toString = () => `.throw(${mockValue && mockValue.toString && mockValue.toString()})`;
      return this.respond(responder);
    },
    return: function (mockValue) {
      const responder: Responder = iterator => iterator.return!(mockValue);
      responder.toString = () => `.return(${mockValue && mockValue.toString && mockValue.toString()})`;
      return this.respond(responder);
    },
  }

  return mock;
}

export const when = (valueOrMatcher: any) => createMock(true, valueOrMatcher);

export const whenever = (valueOrMatcher: any) => createMock(false, valueOrMatcher);
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { PositionDetailDialogParams } from '@ghostfolio/client/components/position/position-detail-dialog/interfaces/interfaces';
import { PositionDetailDialog } from '@ghostfolio/client/components/position/position-detail-dialog/position-detail-dialog.component';
import { DataService } from '@ghostfolio/client/services/data.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  Filter,
  PortfolioDetails,
  PortfolioPosition,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { translate } from '@ghostfolio/ui/i18n';
import { AssetClass, DataSource } from '@prisma/client';
import { DeviceDetectorService } from 'ngx-device-detector';
import { Subject } from 'rxjs';
import { distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'gf-holdings-page',
  styleUrls: ['./holdings-page.scss'],
  templateUrl: './holdings-page.html'
})
export class HoldingsPageComponent implements OnDestroy, OnInit {
  public activeFilters: Filter[] = [];
  public allFilters: Filter[];
  public deviceType: string;
  public filters$ = new Subject<Filter[]>();
  public hasImpersonationId: boolean;
  public hasPermissionToCreateOrder: boolean;
  public holdings: PortfolioPosition[];
  public isLoading = false;
  public placeholder = '';
  public portfolioDetails: PortfolioDetails;
  public user: User;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private deviceService: DeviceDetectorService,
    private dialog: MatDialog,
    private impersonationStorageService: ImpersonationStorageService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    route.queryParams
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((params) => {
        if (
          params['dataSource'] &&
          params['positionDetailDialog'] &&
          params['symbol']
        ) {
          this.openPositionDialog({
            dataSource: params['dataSource'],
            symbol: params['symbol']
          });
        }
      });
  }

  public ngOnInit() {
    this.deviceType = this.deviceService.getDeviceInfo().deviceType;

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
      });

    this.filters$
      .pipe(
        distinctUntilChanged(),
        switchMap((filters) => {
          this.isLoading = true;
          this.activeFilters = filters;
          this.placeholder =
            this.activeFilters.length <= 0
              ? $localize`Filter by account or tag...`
              : '';

          return this.fetchPortfolioDetails();
        }),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe((portfolioDetails) => {
        this.portfolioDetails = portfolioDetails;

        this.initialize();

        this.isLoading = false;

        this.changeDetectorRef.markForCheck();
      });

    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToCreateOrder = hasPermission(
            this.user.permissions,
            permissions.createOrder
          );

          const accountFilters: Filter[] = this.user.accounts.map(
            ({ id, name }) => {
              return {
                id,
                label: name,
                type: 'ACCOUNT'
              };
            }
          );

          const assetClassFilters: Filter[] = [];
          for (const assetClass of Object.keys(AssetClass)) {
            assetClassFilters.push({
              id: assetClass,
              label: translate(assetClass),
              type: 'ASSET_CLASS'
            });
          }

          const tagFilters: Filter[] = this.user.tags.map(({ id, name }) => {
            return {
              id,
              label: translate(name),
              type: 'TAG'
            };
          });

          this.allFilters = [
            ...accountFilters,
            ...assetClassFilters,
            ...tagFilters
          ];

          if (this.user?.settings?.isExperimentalFeatures === true) {
            this.holdings = undefined;

            this.fetchPortfolioDetails()
              .pipe(takeUntil(this.unsubscribeSubject))
              .subscribe((portfolioDetails) => {
                this.portfolioDetails = portfolioDetails;

                this.initialize();

                this.changeDetectorRef.markForCheck();
              });
          }

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private fetchPortfolioDetails() {
    return this.dataService.fetchPortfolioDetails({
      filters:
        this.activeFilters.length > 0
          ? this.activeFilters
          : this.userService.getFilters()
    });
  }

  private initialize() {
    this.holdings = [];

    for (const [symbol, holding] of Object.entries(
      this.portfolioDetails.holdings
    )) {
      this.holdings.push(holding);
    }
  }

  private openPositionDialog({
    dataSource,
    symbol
  }: {
    dataSource: DataSource;
    symbol: string;
  }) {
    this.userService
      .get()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((user) => {
        this.user = user;

        const dialogRef = this.dialog.open(PositionDetailDialog, {
          autoFocus: false,
          data: <PositionDetailDialogParams>{
            dataSource,
            symbol,
            baseCurrency: this.user?.settings?.baseCurrency,
            colorScheme: this.user?.settings?.colorScheme,
            deviceType: this.deviceType,
            hasImpersonationId: this.hasImpersonationId,
            hasPermissionToReportDataGlitch: hasPermission(
              this.user?.permissions,
              permissions.reportDataGlitch
            ),
            locale: this.user?.settings?.locale
          },
          height: this.deviceType === 'mobile' ? '97.5vh' : '80vh',
          width: this.deviceType === 'mobile' ? '100vw' : '50rem'
        });

        dialogRef
          .afterClosed()
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe(() => {
            this.router.navigate(['.'], { relativeTo: this.route });
          });
      });
  }
}

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.db import transaction
from django.db.models import Sum, Q
import json
import traceback
import logging
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.utils import timezone
from .models import (
    Organization, OrganizationUser, StrategicObjective,
    Program, StrategicInitiative, PerformanceMeasure, MainActivity,
    ActivityBudget, SubActivity, ActivityCostingAssumption,InitiativeFeed,
    Plan, PlanReview,Location, LandTransport, AirTransport,
    PerDiem, Accommodation, ParticipantCost, SessionCost,
    PrintingCost, SupervisorCost, ProcurementItem, Report,
    PerformanceAchievement, ActivityAchievement, SubActivityBudgetUtilization
)
from .serializers import (
    OrganizationSerializer, OrganizationUserSerializer, UserSerializer,
    StrategicObjectiveSerializer, ProgramSerializer,
    StrategicInitiativeSerializer, PerformanceMeasureSerializer, MainActivitySerializer,
    ActivityBudgetSerializer,SubActivitySerializer, ActivityCostingAssumptionSerializer, InitiativeFeedSerializer,
    PlanSerializer, PlanReviewSerializer,LocationSerializer, LandTransportSerializer,
    AirTransportSerializer, PerDiemSerializer, AccommodationSerializer,
    ParticipantCostSerializer, SessionCostSerializer, PrintingCostSerializer,
    SupervisorCostSerializer,ProcurementItemSerializer, ReportSerializer,
    PerformanceAchievementSerializer, ActivityAchievementSerializer, SubActivityBudgetUtilizationSerializer,
    AdminPlanSerializer
)

# Set up logger
logger = logging.getLogger(__name__)

@ensure_csrf_cookie
def login_view(request):
    if request.method == 'POST':
        try:
            # Use json.loads instead of request.json
            data = json.loads(request.body.decode('utf-8'))
            username = data.get('username')
            password = data.get('password')
            user = authenticate(request, username=username, password=password)
            if user is not None:
                login(request, user)

                # Get the user's organizations
                user_organizations = OrganizationUser.objects.filter(user=user).select_related('organization')
                user_orgs_data = [
                    {
                        'id': org.id,
                        'user': org.user_id,
                        'organization': org.organization_id,
                        'organization_name': org.organization.name,
                        'role': org.role,
                        'created_at': org.created_at
                    }
                    for org in user_organizations
                ]

                return JsonResponse({
                    'detail': 'Login successful',
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name,
                    },
                    'userOrganizations': user_orgs_data
                })
            else:
                return JsonResponse({'detail': 'Invalid credentials'}, status=400)
        except json.JSONDecodeError:
            return JsonResponse({'detail': 'Invalid JSON'}, status=400)
        except Exception as e:
            logger.exception("Error in login view")
            return JsonResponse({'detail': f'Error: {str(e)}'}, status=400)
    return JsonResponse({'detail': 'Method not allowed'}, status=405)

@csrf_protect
def logout_view(request):
    logout(request)
    logger.info(f"User logged out: {request.user.username if hasattr(request, 'user') and request.user.is_authenticated else 'Anonymous'}")
    return JsonResponse({'detail': 'Logout successful'})

@ensure_csrf_cookie
def check_auth(request):
    if request.user.is_authenticated:
        # Get the user's organizations
        user_organizations = OrganizationUser.objects.filter(user=request.user).select_related('organization')
        user_orgs_data = [
            {
                'id': org.id,
                'user': org.user_id,
                'organization': org.organization_id,
                'organization_name': org.organization.name,
                'role': org.role,
                'created_at': org.created_at
            }
            for org in user_organizations
        ]

        return JsonResponse({
            'isAuthenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name,
            },
            'userOrganizations': user_orgs_data
        })
    return JsonResponse({'isAuthenticated': False})

# CSRF token endpoint
@ensure_csrf_cookie
def csrf_token_view(request):
    return JsonResponse({'detail': 'CSRF cookie set'})

# Update user profile
@csrf_protect
def update_profile(request):
    if not request.user.is_authenticated:
        return JsonResponse({'detail': 'Authentication required'}, status=401)

    if request.method == 'PATCH':
        try:
            data = json.loads(request.body)
            user = request.user

            # Update fields
            if 'first_name' in data:
                user.first_name = data['first_name']
            if 'last_name' in data:
                user.last_name = data['last_name']
            if 'email' in data:
                user.email = data['email']

            user.save()

            return JsonResponse({
                'detail': 'Profile updated successfully',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                }
            })
        except Exception as e:
            logger.exception("Error updating profile")
            return JsonResponse({'detail': f'Error updating profile: {str(e)}'}, status=400)

    return JsonResponse({'detail': 'Method not allowed'}, status=405)

# Change password
@csrf_protect
def password_change(request):
    if not request.user.is_authenticated:
        return JsonResponse({'detail': 'Authentication required'}, status=401)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            current_password = data.get('current_password')
            new_password = data.get('new_password')

            # Check if current password is correct
            user = authenticate(username=request.user.username, password=current_password)
            if not user:
                return JsonResponse({'detail': 'Current password is incorrect'}, status=400)

            # Validate new password
            try:
                validate_password(new_password, user)
            except ValidationError as e:
                return JsonResponse({'detail': e.messages[0]}, status=400)

            # Set new password
            user.set_password(new_password)
            user.save()

            # Update session to prevent logout
            login(request, user)

            return JsonResponse({'detail': 'Password changed successfully'})
        except Exception as e:
            logger.exception("Error changing password")
            return JsonResponse({'detail': f'Error changing password: {str(e)}'}, status=400)

    return JsonResponse({'detail': 'Method not allowed'}, status=405)

class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [AllowAny]  # Allow public access to organizations

    def get_permissions(self):
        if self.request.method == 'GET':
            # For GET requests (list, retrieve), allow public access
            return [AllowAny()]
        # For other methods, use the default permissions
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        try:
            logger.info("OrganizationViewSet.list called")
            logger.info(f"User authenticated: {request.user.is_authenticated}")
            queryset = self.filter_queryset(self.get_queryset())
            serializer = self.get_serializer(queryset, many=True)
            data = serializer.data
            logger.info(f"Returning {len(data)} organizations")
            return Response(data)
        except Exception as e:
            logger.exception("Error in OrganizationViewSet.list")
            return Response({"error": str(e)}, status=500)

    def retrieve(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error in OrganizationViewSet.retrieve")
            return Response({"error": str(e)}, status=500)

    def get_queryset(self):
        try:
            logger.info("Fetching all organizations in get_queryset")
            logger.info(f"User authenticated: {self.request.user.is_authenticated}")
            logger.info(f"User: {self.request.user.username if self.request.user.is_authenticated else 'Anonymous'}")
            queryset = Organization.objects.all()
            logger.info(f"Found {queryset.count()} organizations")
            return queryset
        except Exception as e:
            logger.exception("Error in get_queryset")
            # Return empty queryset on error
            return Organization.objects.none()

    def update(self, request, *args, **kwargs):
        try:
            logger.info(f"Updating organization: {kwargs.get('pk')}")
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Explicitly log the data being saved
            logger.info(f"Organization update data: {request.data}")

            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error updating organization")
            return Response({"error": str(e)}, status=500)

class OrganizationUserViewSet(viewsets.ModelViewSet):
    queryset = OrganizationUser.objects.all()
    serializer_class = OrganizationUserSerializer
    permission_classes = [IsAuthenticated]
class InitiativeFeedViewSet(viewsets.ModelViewSet):
    queryset = InitiativeFeed.objects.filter(is_active=True).select_related('strategic_objective').order_by('name')
    serializer_class = InitiativeFeedSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        strategic_objective = self.request.query_params.get('strategic_objective', None)
        user_org = getattr(self.request.user, 'organization', None)

        if strategic_objective is not None:
            base_queryset = queryset.filter(strategic_objective=strategic_objective)
            if user_org:
                # Show initiatives that are default OR belong to user's org OR have no org (legacy)
                queryset = base_queryset.filter(
                    models.Q(is_default=True) |
                    models.Q(organization__isnull=True) |
                    models.Q(organization=user_org)
                )
            else:
                queryset = base_queryset
        elif user_org:
            # If no specific filters, still filter by organization
            queryset = queryset.filter(
                models.Q(is_default=True) |
                models.Q(organization__isnull=True) |
                models.Q(organization=user_org)
            )

        # Add proper ordering and select_related for performance
        queryset = queryset.select_related('strategic_objective', 'organization').order_by('-created_at')

        console_log_message = f"StrategicInitiativeViewSet: Filtered queryset - objective:{strategic_objective}, user_org:{user_org}, count:{queryset.count()}"
        print(console_log_message)

        return queryset
class StrategicObjectiveViewSet(viewsets.ModelViewSet):
    queryset = StrategicObjective.objects.all()
    serializer_class = StrategicObjectiveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Ensure we always return objectives with proper error handling
        """
        try:
            queryset = StrategicObjective.objects.all().order_by('id')
            return queryset
        except Exception as e:
            print(f"Error in StrategicObjectiveViewSet.get_queryset: {e}")
            return StrategicObjective.objects.none()

    def list(self, request, *args, **kwargs):
        """
        Override list method to ensure proper error handling and response format
        """
        try:
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)

            # Ensure we return data in expected format
            return Response({
                'data': serializer.data,
                'count': len(serializer.data)
            })
        except Exception as e:
            print(f"Error in StrategicObjectiveViewSet.list: {e}")
            return Response({
                'error': 'Failed to load strategic objectives',
                'data': []
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def retrieve(self, request, *args, **kwargs):
        """
        Override retrieve method for better error handling
        """
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except Exception as e:
            print(f"Error in StrategicObjectiveViewSet.retrieve: {e}")
            return Response({
                'error': 'Failed to load strategic objective'
            }, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, *args, **kwargs):
        """
        Override update method with better error handling
        """
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)

            if serializer.is_valid():
                self.perform_update(serializer)
                return Response(serializer.data)
            else:
                print(f"Validation errors in objective update: {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print(f"Error in StrategicObjectiveViewSet.update: {e}")
            return Response({
                'error': 'Failed to update strategic objective'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def update(self, request, *args, **kwargs):
        try:
            logger.info(f"Updating strategic objective: {kwargs.get('pk')}")
            partial = kwargs.pop('partial', False)
            instance = self.get_object()

            # Log the current and new values
            logger.info(f"Current weight: {instance.weight}")
            logger.info(f"Current planner_weight: {instance.planner_weight}")
            logger.info(f"Update data: {request.data}")

            # Determine if this is a planner updating a default objective
            user_is_planner = OrganizationUser.objects.filter(
                user=request.user,
                role='PLANNER'
            ).exists()

            # If a planner is updating weight for a default objective, set planner_weight
            if user_is_planner and instance.is_default and 'weight' in request.data:
                # Store the requested weight in planner_weight instead of weight
                if 'planner_weight' not in request.data:
                    request.data['planner_weight'] = request.data['weight']
                logger.info(f"Planner updating default objective. Setting planner_weight to {request.data['planner_weight']}")

            # Process the update
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Log the updated instance
            logger.info(f"Updated weight: {instance.weight}")
            logger.info(f"Updated planner_weight: {instance.planner_weight}")

            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error updating strategic objective")
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=['get'])
    def weight_summary(self, request):
        """
        Get weight summary with proper error handling
        """
        try:
            objectives = StrategicObjective.objects.all()
            total_weight = sum(obj.get_effective_weight() for obj in objectives)
            remaining_weight = 100 - total_weight
            is_valid = total_weight == 100

            return Response({
                'total_weight': total_weight,
                'remaining_weight': remaining_weight,
                'is_valid': is_valid
            })
        except Exception as e:
            print(f"Error in weight_summary: {e}")
            return Response({
                'error': 'Failed to calculate weight summary',
                'total_weight': 0,
                'remaining_weight': 100,
                'is_valid': False
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        """
        Get the sum of all objective weights and check if they sum to 100%
        """
        total_weight = StrategicObjective.objects.aggregate(
            total=Sum('weight')
        )['total'] or 0

        # Calculate remaining weight (target is 100%)
        remaining_weight = 100 - total_weight

        # Validate if total is valid (should be 100%)
        is_valid = total_weight == 100

        return Response({
            'total_weight': total_weight,
            'remaining_weight': remaining_weight,
            'is_valid': is_valid
        })

    @action(detail=False, methods=['post'])
    def validate_total_weight(self, request):
        """
        Validate that the total weight of all objectives is 100%
        """
        total_weight = StrategicObjective.objects.aggregate(
            total=Sum('weight')
        )['total'] or 0

        if total_weight == 100:
            return Response({
                'detail': 'Total weight of all objectives is 100%',
                'is_valid': True
            })
        else:
            return Response({
                'detail': f'Total weight of all objectives should be 100%, but is {total_weight}%',
                'is_valid': False
            }, status=status.HTTP_400_BAD_REQUEST)

class ProgramViewSet(viewsets.ModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Get current user's organization for filtering
        user_org = None
        if self.request.user.is_authenticated:
            user_org_instance = self.request.user.organization_users.first()
            if user_org_instance:
                user_org = user_org_instance.organization_id

        # Filter by strategic objective if provided
        strategic_objective_id = self.request.query_params.get('strategic_objective')
        if strategic_objective_id:
            queryset = queryset.filter(strategic_objective_id=strategic_objective_id)

        return queryset

class StrategicInitiativeViewSet(viewsets.ModelViewSet):
    queryset = StrategicInitiative.objects.all()
    serializer_class = StrategicInitiativeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Get the user's organizations
        if self.request.user.is_authenticated:
            user_organizations = OrganizationUser.objects.filter(user=self.request.user).values_list('organization_id', flat=True)
        else:
            user_organizations = []

        # Filter based on query parameters
        strategic_objective = self.request.query_params.get('objective')
        program = self.request.query_params.get('program')

        # Handle filtering by parent type
        if strategic_objective:
            base_query = queryset.filter(strategic_objective_id=strategic_objective)
        elif program:
            base_query = queryset.filter(program_id=program)
        else:
            base_query = queryset

        # Return default initiatives OR initiatives from the user's organizations
        return base_query.filter(
            Q(is_default=True) |  # All default initiatives
            Q(is_default=False, organization_id__in=user_organizations)  # Custom initiatives from user's orgs
        )

    def perform_create(self, serializer):
        # Get the organization_id from the request data
        organization_id = serializer.validated_data.get('organization_id')
        initiative_feed = serializer.validated_data.get('initiative_feed')

        # If using an initiative feed, copy the name
        name = serializer.validated_data.get('name')
        if initiative_feed and not name:
            name = initiative_feed.name

        # If no organization_id was provided, try to get the user's primary organization
        if not organization_id:
            user_org = OrganizationUser.objects.filter(user=self.request.user).first()
            if user_org:
                organization_id = user_org.organization_id

        # Set is_default=False and organization_id when created by a planner
        if not serializer.validated_data.get('is_default', True) and organization_id:
            serializer.save(
                organization_id=organization_id,
                is_default=False,
                name=name
            )
        else:
            serializer.save(name=name)

    @action(detail=False, methods=['get'])
    def weight_summary(self, request):
        """
        Calculate weight summary for initiatives under a specific parent
        """
        strategic_objective_id = request.query_params.get('objective')
        program_id = request.query_params.get('program')

        if strategic_objective_id:
            # Get the objective
            try:
                objective = StrategicObjective.objects.get(id=strategic_objective_id)
                # Use the effective weight (planner_weight if available, otherwise weight)
                if objective.planner_weight is not None:
                    parent_weight = objective.planner_weight
                else:
                    parent_weight = objective.weight
                parent_type = 'strategic_objective'
                parent_id = strategic_objective_id

                logger.info(f"Initiative weight summary for objective {objective.id}: weight={objective.weight}, planner_weight={objective.planner_weight}, effective={parent_weight}")
            except StrategicObjective.DoesNotExist:
                return Response({'detail': 'Strategic objective not found'}, status=status.HTTP_404_NOT_FOUND)

            # Get initiatives for this objective
            initiatives = self.get_queryset().filter(strategic_objective_id=strategic_objective_id)

        elif program_id:
            # Get the program
            try:
                program = Program.objects.get(id=program_id)
                parent_weight = 100  # Programs no longer have weight
                parent_type = 'program'
                parent_id = program_id
            except Program.DoesNotExist:
                return Response({'detail': 'Program not found'}, status=status.HTTP_404_NOT_FOUND)

            # Get initiatives for this program
            initiatives = self.get_queryset().filter(program_id=program_id)

        else:
            return Response({'detail': 'Missing parent ID parameter'}, status=status.HTTP_400_BAD_REQUEST)

        # Calculate total initiatives weight
        total_initiatives_weight = initiatives.aggregate(
            total=Sum('weight')
        )['total'] or 0

        # Calculate remaining weight
        remaining_weight = parent_weight - total_initiatives_weight

        # Validate if total is valid (should be equal to parent_weight for objectives)
        is_valid = parent_type == 'strategic_objective' and abs(total_initiatives_weight - parent_weight) < 0.01 or total_initiatives_weight <= parent_weight

        return Response({
            'parent_type': parent_type,
            'parent_id': parent_id,
            'parent_weight': parent_weight,
            'total_initiatives_weight': total_initiatives_weight,
            'remaining_weight': remaining_weight,
            'is_valid': is_valid
        })

    @action(detail=False, methods=['post'])
    def validate_initiatives_weight(self, request):
        """
        Validate that the total weight of initiatives is correct for the parent
        """
        strategic_objective_id = request.query_params.get('objective')
        program_id = request.query_params.get('program')

        if strategic_objective_id:
            # Get the objective
            try:
                objective = StrategicObjective.objects.get(id=strategic_objective_id)
                parent_weight = objective.get_effective_weight()  # Use effective weight
                parent_type = 'strategic objective'

                initiatives = self.get_queryset().filter(strategic_objective_id=strategic_objective_id)

                total_weight = initiatives.aggregate(
                    total=Sum('weight')
                )['total'] or 0

                # For objectives, total must equal parent_weight exactly (using epsilon for floating point comparison)
                if abs(total_weight - parent_weight) < 0.01:
                    return Response({
                        'message': f'Total weight of initiatives for this {parent_type} is {parent_weight}%',
                        'is_valid': True
                    })
                else:
                    return Response({
                        'message': f'Total weight of initiatives for this {parent_type} should be {parent_weight}%, but is {total_weight}%',
                        'is_valid': False,
                        'total_weight': total_weight,
                        'parent_weight': parent_weight
                    }, status=status.HTTP_400_BAD_REQUEST)

            except StrategicObjective.DoesNotExist:
                return Response({'detail': 'Strategic objective not found'}, status=status.HTTP_404_NOT_FOUND)

        elif program_id:
            initiatives = self.get_queryset().filter(program_id=program_id)
            parent_type = 'program'

            total_weight = initiatives.aggregate(
                total=Sum('weight')
            )['total'] or 0

            # For programs, total should not exceed 100%
            if total_weight <= 100:
                return Response({
                    'message': f'Total weight of initiatives for this {parent_type} is {total_weight}%',
                    'is_valid': True
                })
            else:
                return Response({
                    'message': f'Total weight of initiatives for this {parent_type} should not exceed 100%, but is {total_weight}%',
                    'is_valid': False,
                    'total_weight': total_weight
                }, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'detail': 'Missing parent ID parameter'}, status=status.HTTP_400_BAD_REQUEST)

class PerformanceMeasureViewSet(viewsets.ModelViewSet):
    queryset = PerformanceMeasure.objects.all()
    serializer_class = PerformanceMeasureSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Get the user's organizations
        if self.request.user.is_authenticated:
            user_organizations = OrganizationUser.objects.filter(user=self.request.user).values_list('organization_id', flat=True)
        else:
            user_organizations = []

        # Filter by initiative if provided
        initiative_id = self.request.query_params.get('initiative')
        if initiative_id:
            # Get the base queryset filtered by initiative
            base_query = queryset.filter(initiative_id=initiative_id)

            # Return default measures (with no organization) OR measures from the user's organizations
            return base_query.filter(
                Q(organization__isnull=True) |  # Default measures with no organization
                Q(organization_id__in=user_organizations)  # Custom measures from user's orgs
            )

        return queryset

    def perform_create(self, serializer):
        # Get the organization_id from the request data
        organization_id = serializer.validated_data.get('organization_id')

        # If no organization_id was provided, try to get the user's primary organization
        if not organization_id:
            user_org = OrganizationUser.objects.filter(user=self.request.user).first()
            if user_org:
                organization_id = user_org.organization_id

        # Save with the organization ID
        serializer.save(organization_id=organization_id)

    @action(detail=False, methods=['get'])
    def weight_summary(self, request):
        """
        Calculate weight summary for performance measures under a specific initiative
        """
        initiative_id = request.query_params.get('initiative')

        if not initiative_id:
            return Response({'detail': 'Initiative ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Get the initiative to check its weight
            initiative = StrategicInitiative.objects.get(id=initiative_id)
            initiative_weight = initiative.weight

            # Get measures for this initiative
            measures = self.get_queryset().filter(initiative_id=initiative_id)

            # Calculate total measures weight
            total_measures_weight = measures.aggregate(
                total=Sum('weight')
            )['total'] or 0

            # Expected weight for measures is 35% of initiative weight
            expected_measures_weight = 35

            # Calculate remaining weight
            remaining_weight = expected_measures_weight - total_measures_weight

            # Validate if total is valid (should be 35%)
            is_valid = total_measures_weight == expected_measures_weight

            return Response({
                'initiative_id': initiative_id,
                'initiative_weight': initiative_weight,
                'expected_measures_weight': expected_measures_weight,
                'total_measures_weight': total_measures_weight,
                'remaining_weight': remaining_weight,
                'is_valid': is_valid
            })

        except StrategicInitiative.DoesNotExist:
            return Response({'detail': 'Initiative not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'])
    def validate_measures_weight(self, request):
        """
        Validate that the total weight of performance measures is 35%
        """
        initiative_id = request.query_params.get('initiative')

        if not initiative_id:
            return Response({'detail': 'Initiative ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Get measures for this initiative
        measures = self.get_queryset().filter(initiative_id=initiative_id)

        # Calculate total measures weight
        total_weight = measures.aggregate(
            total=Sum('weight')
        )['total'] or 0

        # Expected weight for measures is 35%
        expected_weight = 35

        # Check if weight is exactly 35%
        if total_weight == expected_weight:
            return Response({
                'message': 'Total weight of performance measures is 35%',
                'is_valid': True
            })
        else:
            return Response({
                'message': f'Total weight of performance measures should be 35%, but is {total_weight}%',
                'is_valid': False,
                'total_weight': total_weight
            }, status=status.HTTP_400_BAD_REQUEST)
# Location viewset
class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by region if provided
        region = self.request.query_params.get('region')
        if region:
            queryset = queryset.filter(region=region)

        # Filter by hardship area
        hardship = self.request.query_params.get('is_hardship_area')
        if hardship:
            hardship_bool = hardship.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(is_hardship_area=hardship_bool)

        return queryset

# Land Transport viewset
class LandTransportViewSet(viewsets.ModelViewSet):
    queryset = LandTransport.objects.all()
    serializer_class = LandTransportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by origin location
        origin = self.request.query_params.get('origin')
        if origin:
            queryset = queryset.filter(origin_id=origin)

        # Filter by destination location
        destination = self.request.query_params.get('destination')
        if destination:
            queryset = queryset.filter(destination_id=destination)

        # Filter by trip type
        trip_type = self.request.query_params.get('trip_type')
        if trip_type:
            queryset = queryset.filter(trip_type=trip_type)

        return queryset

# Air Transport viewset
class AirTransportViewSet(viewsets.ModelViewSet):
    queryset = AirTransport.objects.all()
    serializer_class = AirTransportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by origin location
        origin = self.request.query_params.get('origin')
        if origin:
            queryset = queryset.filter(origin_id=origin)

        # Filter by destination location
        destination = self.request.query_params.get('destination')
        if destination:
            queryset = queryset.filter(destination_id=destination)

        # Filter by trip type
        trip_type = self.request.query_params.get('trip_type')
        if trip_type:
            queryset = queryset.filter(trip_type=trip_type)

        return queryset

# PerDiem viewset
class PerDiemViewSet(viewsets.ModelViewSet):
    queryset = PerDiem.objects.all()
    serializer_class = PerDiemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by location
        location = self.request.query_params.get('location')
        if location:
            queryset = queryset.filter(location_id=location)

        return queryset

# Accommodation viewset
class AccommodationViewSet(viewsets.ModelViewSet):
    queryset = Accommodation.objects.all()
    serializer_class = AccommodationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by location
        location = self.request.query_params.get('location')
        if location:
            queryset = queryset.filter(location_id=location)

        # Filter by service type
        service_type = self.request.query_params.get('service_type')
        if service_type:
            queryset = queryset.filter(service_type=service_type)

        return queryset

# ParticipantCost viewset
class ParticipantCostViewSet(viewsets.ModelViewSet):
    queryset = ParticipantCost.objects.all()
    serializer_class = ParticipantCostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by cost type
        cost_type = self.request.query_params.get('cost_type')
        if cost_type:
            queryset = queryset.filter(cost_type=cost_type)

        return queryset

# SessionCost viewset
class SessionCostViewSet(viewsets.ModelViewSet):
    queryset = SessionCost.objects.all()
    serializer_class = SessionCostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by cost type
        cost_type = self.request.query_params.get('cost_type')
        if cost_type:
            queryset = queryset.filter(cost_type=cost_type)

        return queryset

# PrintingCost viewset
class PrintingCostViewSet(viewsets.ModelViewSet):
    queryset = PrintingCost.objects.all()
    serializer_class = PrintingCostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by document type
        document_type = self.request.query_params.get('document_type')
        if document_type:
            queryset = queryset.filter(document_type=document_type)

        return queryset

# SupervisorCost viewset
class SupervisorCostViewSet(viewsets.ModelViewSet):
    queryset = SupervisorCost.objects.all()
    serializer_class = SupervisorCostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by cost type
        cost_type = self.request.query_params.get('cost_type')
        if cost_type:
            queryset = queryset.filter(cost_type=cost_type)

        return queryset
# ProcurementItem viewset
class ProcurementItemViewSet(viewsets.ModelViewSet):
    queryset = ProcurementItem.objects.all()
    serializer_class = ProcurementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        return queryset
class MainActivityViewSet(viewsets.ModelViewSet):
    queryset = MainActivity.objects.all()
    serializer_class = MainActivitySerializer
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """
        Custom destroy method to handle cascade deletes properly in production
        """
        try:
            instance = self.get_object()
            instance_name = instance.name
            
            print(f"MainActivityViewSet: Starting delete for main activity {instance.id} ({instance_name})")
            
            # Get sub-activities count for logging
            sub_activities = list(instance.sub_activities.all())
            sub_activity_count = len(sub_activities)
            print(f"Found {sub_activity_count} sub-activities to delete")
            
            # Clean up any ActivityBudget records that reference these sub-activities
            if sub_activity_count > 0:
                logger.info(f"Cleaning up budget references for {sub_activity_count} sub-activities")
                for sub_activity in sub_activities:
                    ActivityBudget.objects.filter(sub_activity_id=str(sub_activity.id)).delete()
                
            # Clean up legacy budget records linked to main activity
            legacy_budgets = ActivityBudget.objects.filter(activity=instance)
            legacy_count = legacy_budgets.count()
            if legacy_count > 0:
                logger.info(f"Deleting {legacy_count} legacy ActivityBudget records")
                legacy_budgets.delete()
                
            # Delete the main activity (this will cascade to sub-activities)
            instance.delete()
            print(f"Main activity {instance.id} deleted successfully")
            
            return Response(
                {'message': 'Main activity and all related data deleted successfully'}, 
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Exception as e:
            print(f"Error deleting main activity {kwargs.get('pk')}: {str(e)}")
            return Response(
                {'error': f'Failed to delete main activity: {str(e)}'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

    def get_queryset(self):
        queryset = super().get_queryset()

        # Get the user's organizations
        if self.request.user.is_authenticated:
            user_organizations = OrganizationUser.objects.filter(user=self.request.user).values_list('organization_id', flat=True)
        else:
            user_organizations = []

        # Filter by initiative if provided
        initiative_id = self.request.query_params.get('initiative')
        if initiative_id:
            # Get the base queryset filtered by initiative
            base_query = queryset.filter(initiative_id=initiative_id)

            # Return activities with no organization OR activities from user's organizations
            return base_query.filter(
                Q(organization__isnull=True) |  # Default activities with no organization
                Q(organization_id__in=user_organizations)  # Custom activities from user's orgs
            )

        return queryset

    def perform_create(self, serializer):
        # Get the organization_id from the request data
        organization_id = serializer.validated_data.get('organization_id')

        # If no organization_id was provided, try to get the user's primary organization
        if not organization_id:
            user_org = OrganizationUser.objects.filter(user=self.request.user).first()
            if user_org:
                organization_id = user_org.organization_id

        # Save with the organization ID
        serializer.save(organization_id=organization_id)

    @action(detail=False, methods=['get'])
    def weight_summary(self, request):
        """
        Calculate weight summary for main activities under a specific initiative
        """
        initiative_id = request.query_params.get('initiative')

        if not initiative_id:
            return Response({'detail': 'Initiative ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Get the initiative to check its weight
            initiative = StrategicInitiative.objects.get(id=initiative_id)
            initiative_weight = float(initiative.weight)

            # Get activities for this initiative
            activities = self.get_queryset().filter(initiative_id=initiative_id)

            # Calculate total activities weight
            total_weight_result = activities.aggregate(
                total=Sum('weight')
            )
            total_activities_weight = float(total_weight_result['total'] or 0)

            # Expected weight for activities is 65% of initiative weight
            expected_activities_weight = round(initiative_weight * 0.65, 2)

            # Calculate remaining weight
            remaining_weight = expected_activities_weight - total_activities_weight

            # Validate if total is valid (should be 65% of initiative weight)
            is_valid = abs(total_activities_weight - expected_activities_weight) < 0.01

            return Response({
                'initiative_id': initiative_id,
                'initiative_weight': initiative_weight,
                'expected_activities_weight': expected_activities_weight,
                'total_activities_weight': total_activities_weight,
                'remaining_weight': remaining_weight,
                'is_valid': is_valid
            })

        except StrategicInitiative.DoesNotExist:
            return Response({'detail': 'Initiative not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'])
    def validate_activities_weight(self, request):
        """
        Validate that the total weight of main activities is 65% of initiative weight
        """
        initiative_id = request.query_params.get('initiative')

        if not initiative_id:
            return Response({'detail': 'Initiative ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Get the initiative to check its weight
        try:
            initiative = StrategicInitiative.objects.get(id=initiative_id)
            initiative_weight = float(initiative.weight)
        except StrategicInitiative.DoesNotExist:
            return Response({'detail': 'Initiative not found'}, status=status.HTTP_404_NOT_FOUND)

        # Get activities for this initiative
        activities = self.get_queryset().filter(initiative_id=initiative_id)

        # Calculate total activities weight
        total_weight = activities.aggregate(
            total=Sum('weight')
        )['total'] or 0

        # Expected weight for activities is 65% of initiative weight (as a value)
        expected_weight = round(initiative_weight * 0.65, 2)

        # Check if weight is exactly 65% of initiative weight
        if abs(float(total_weight) - expected_weight) < 0.01:
            return Response({
                'message': f'Total weight of main activities is {expected_weight} (65% of initiative weight {initiative_weight})',
                'is_valid': True
            })
        else:
            return Response({
                'message': f'Total weight of main activities should be {expected_weight} (65% of initiative weight {initiative_weight}), but is {total_weight}',
                'is_valid': False,
                'total_weight': total_weight
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def update_budget(self, request, pk=None):
        """
        Update or create budget for an activity
        """
        activity = self.get_object()

        try:
            with transaction.atomic():
                # Try to get existing budget
                try:
                    budget = SubActivity.objects.get(activity=activity)
                    # Update existing budget
                    budget_serializer = SubActivitySerializer(budget, data=request.data, partial=True)
                except SubActivity.DoesNotExist:
                    # Create new budget
                    budget_serializer = SubActivitySerializer(data=request.data)

                budget_serializer.is_valid(raise_exception=True)
                budget = budget_serializer.save(activity=activity)

                # Return updated budget
                return Response(SubActivitySerializer(budget).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)



class SubActivityViewSet(viewsets.ModelViewSet):
    queryset = SubActivity.objects.all()
    serializer_class = SubActivitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = SubActivity.objects.select_related(
            'main_activity',
            'main_activity__initiative',
            'main_activity__initiative__organization',
            'main_activity__organization'
        ).all()

        user = self.request.user

        # Get user's organizations and role
        user_organizations = OrganizationUser.objects.filter(user=user)

        if user_organizations.exists():
            user_roles = user_organizations.values_list('role', flat=True)
            user_org_ids = list(user_organizations.values_list('organization', flat=True))

            # Helper function to get all child organizations recursively
            def get_child_organizations(parent_org_id):
                child_ids = [parent_org_id]

                def get_descendants(org_id):
                    children = Organization.objects.filter(parent_id=org_id).values_list('id', flat=True)
                    for child_id in children:
                        if child_id not in child_ids:
                            child_ids.append(child_id)
                            get_descendants(child_id)

                get_descendants(parent_org_id)
                return child_ids

            # ADMIN users can see sub-activities from their organization hierarchy
            if 'ADMIN' in user_roles:
                admin_org = user_organizations.first().organization
                admin_org_id = admin_org.id

                # Get all child organizations in the hierarchy
                allowed_org_ids = get_child_organizations(admin_org_id)

                # Filter sub-activities by organization through main_activity -> initiative -> organization
                queryset = queryset.filter(
                    Q(main_activity__initiative__organization__in=allowed_org_ids) |
                    Q(main_activity__organization__in=allowed_org_ids)
                )
                logger.info(f"Admin {user.username} accessing sub-activities from organization hierarchy: {allowed_org_ids}")

            # EVALUATOR users can see all sub-activities (no filtering)
            elif 'EVALUATOR' in user_roles:
                # No filtering for evaluators
                pass

            # PLANNER users can only see sub-activities from their own organizations
            elif 'PLANNER' in user_roles:
                queryset = queryset.filter(
                    Q(main_activity__initiative__organization__in=user_org_ids) |
                    Q(main_activity__organization__in=user_org_ids)
                )
                logger.info(f"Planner {user.username} accessing sub-activities from orgs: {user_org_ids}")

        main_activity = self.request.query_params.get('main_activity', None)
        if main_activity is not None:
            queryset = queryset.filter(main_activity=main_activity)

        return queryset

    @action(detail=True, methods=['post'])
    def add_budget(self, request, pk=None):
        """Add budget for a sub-activity"""
        try:
            sub_activity = self.get_object()
            budget_data = request.data

            # Create budget for this sub-activity
            budget = ActivityBudget.objects.create(
                sub_activity=sub_activity,
                **budget_data
            )

            serializer = ActivityBudgetSerializer(budget)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """
        Custom destroy method to handle cascade deletes properly in production
        """
        try:
            instance = self.get_object()
            instance_name = instance.name
            
            print(f"SubActivityViewSet: Starting delete for sub-activity {instance.id} ({instance_name})")
            
            # Use the model's custom delete method which handles cascades
            instance.delete()
            
            print(f"SubActivityViewSet: Successfully deleted sub-activity {instance_name}")
            
            return Response(
                {"detail": f"Sub-activity '{instance_name}' and all related data deleted successfully"},
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Exception as e:
            print(f"SubActivityViewSet: Error deleting sub-activity: {e}")
            return Response(
                {"detail": f"Failed to delete sub-activity: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['put'])
    def update_budget(self, request, pk=None):
        """Update budget for a sub-activity"""
        try:
            sub_activity = self.get_object()
            budget_data = request.data

            # Get or create the budget
            budget, created = ActivityBudget.objects.get_or_create(
                sub_activity=sub_activity,
                defaults=budget_data
            )

            if not created:
                # Update existing budget
                for key, value in budget_data.items():
                    if hasattr(budget, key):
                        setattr(budget, key, value)
                budget.save()

            serializer = ActivityBudgetSerializer(budget)
            return Response(serializer.data)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['delete'])
    def delete_budget(self, request, pk=None):
        """Delete budget for a sub-activity"""
        try:
            sub_activity = self.get_object()

            if hasattr(sub_activity, 'budget'):
                sub_activity.budget.delete()
                return Response({'message': 'Budget deleted successfully'})
            else:
                return Response(
                    {'error': 'No budget found for this sub-activity'},
                    status=status.HTTP_404_NOT_FOUND
                )

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class ActivityBudgetViewSet(viewsets.ModelViewSet):
    queryset = ActivityBudget.objects.all()
    serializer_class = ActivityBudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ActivityBudget.objects.all()
        sub_activity = self.request.query_params.get('sub_activity', None)
        if sub_activity is not None:
            queryset = queryset.filter(sub_activity=sub_activity)
        # Keep legacy activity filtering for backward compatibility
        activity = self.request.query_params.get('activity', None)
        if activity is not None and not sub_activity:
            queryset = queryset.filter(activity=activity)
        return queryset



class ActivityCostingAssumptionViewSet(viewsets.ModelViewSet):
    queryset = ActivityCostingAssumption.objects.all()
    serializer_class = ActivityCostingAssumptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by activity type if provided
        activity_type = self.request.query_params.get('activity_type')
        if activity_type:
            queryset = queryset.filter(activity_type=activity_type)

        # Filter by location if provided
        location = self.request.query_params.get('location')
        if location:
            queryset = queryset.filter(location=location)

        # Filter by cost type if provided
        cost_type = self.request.query_params.get('cost_type')
        if cost_type:
            queryset = queryset.filter(cost_type=cost_type)

        return queryset


class PlanViewSet(viewsets.ModelViewSet):
    queryset = Plan.objects.all().select_related('organization', 'strategic_objective').prefetch_related('reviews', 'selected_objectives')
    serializer_class = PlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter plans based on user's role and organization hierarchy"""
        queryset = super().get_queryset()
        user = self.request.user

        # Check for special 'all' parameter for evaluators/admins
        show_all = self.request.query_params.get('all', 'false').lower() == 'true'

        # Get user's organizations and role
        user_organizations = OrganizationUser.objects.filter(user=user)

        if not user_organizations.exists():
            # User has no organization access, return empty queryset
            logger.warning(f"User {user.username} has no organization access")
            return queryset.none()

        # Check user's role
        user_roles = user_organizations.values_list('role', flat=True)
        user_org_ids = user_organizations.values_list('organization', flat=True)

        logger.info(f"User {user.username} roles: {list(user_roles)}, orgs: {list(user_org_ids)}")

        # Apply query parameter filters
        status_param = self.request.query_params.get('status')
        status_in_param = self.request.query_params.get('status__in')
        org_in_param = self.request.query_params.get('organization__in')

        if status_param:
            queryset = queryset.filter(status=status_param)
            logger.info(f"Filtering by status: {status_param}")

        if status_in_param:
            statuses = [s.strip() for s in status_in_param.split(',')]
            queryset = queryset.filter(status__in=statuses)
            logger.info(f"Filtering by statuses: {statuses}")

        if org_in_param:
            org_ids = [int(o.strip()) for o in org_in_param.split(',') if o.strip().isdigit()]
            queryset = queryset.filter(organization__in=org_ids)
            logger.info(f"Filtering by organizations: {org_ids}")

        # Helper function to get all child organizations recursively
        def get_child_organizations(parent_org_id):
            child_ids = [parent_org_id]

            def get_descendants(org_id):
                children = Organization.objects.filter(parent_id=org_id).values_list('id', flat=True)
                for child_id in children:
                    if child_id not in child_ids:
                        child_ids.append(child_id)
                        get_descendants(child_id)

            get_descendants(parent_org_id)
            return child_ids

        # Admins can see plans from their organization hierarchy
        if 'ADMIN' in user_roles:
            admin_org = user_organizations.first().organization
            admin_org_id = admin_org.id
            admin_org_type = admin_org.type

            # Get all child organizations in the hierarchy
            allowed_org_ids = get_child_organizations(admin_org_id)

            queryset = queryset.filter(organization__in=allowed_org_ids)
            logger.info(f"Admin {user.username} accessing plans from organization hierarchy: {allowed_org_ids}")
            return queryset

        # Evaluators can see all plans (no hierarchy filtering)
        if 'EVALUATOR' in user_roles:
            if show_all:
                logger.info(f"Evaluator {user.username} accessing all plans for statistics")
                return queryset
            else:
                # Filter by evaluator's organizations unless already filtered
                if not org_in_param:
                    queryset = queryset.filter(organization__in=user_org_ids)
                logger.info(f"Evaluator {user.username} accessing plans from their organizations")
                return queryset

        # Planners can only see plans from their own organizations
        if 'PLANNER' in user_roles:
            filtered_queryset = queryset.filter(organization__in=user_org_ids)
            logger.info(f"Planner {user.username} accessing {filtered_queryset.count()} plans from orgs {list(user_org_ids)}")
            return filtered_queryset

        # Default: no access
        logger.warning(f"User {user.username} has no recognized role, denying access")
        return queryset.none()

    def create(self, request, *args, **kwargs):
        """Custom create method with enhanced logging and validation"""
        logger.info(f"PlanViewSet.create called with data: {request.data}")

        try:
            # Validate required fields
            required_fields = ['organization', 'planner_name', 'type', 'from_date', 'to_date']
            for field in required_fields:
                if not request.data.get(field):
                    return Response(
                        {'error': f'{field} is required'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Validate selected objectives
            selected_objectives = request.data.get('selected_objectives', [])
            if not selected_objectives:
                return Response(
                    {'error': 'At least one objective must be selected'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate selected objectives weights
            selected_objectives_weights = request.data.get('selected_objectives_weights')
            if not selected_objectives_weights:
                return Response(
                    {'error': 'Selected objectives weights are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            logger.info(f"Validation passed. Creating plan with serializer...")

            # Use transaction to ensure data consistency
            with transaction.atomic():
                serializer = self.get_serializer(data=request.data)
                if serializer.is_valid():
                    plan = serializer.save()
                    logger.info(f"Plan created successfully with ID: {plan.id}")

                    # Verify the data was saved correctly
                    plan.refresh_from_db()
                    logger.info(f"Plan verification - selected_objectives count: {plan.selected_objectives.count()}")
                    logger.info(f"Plan verification - selected_objectives_weights: {plan.selected_objectives_weights}")

                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                else:
                    logger.error(f"Serializer validation failed: {serializer.errors}")
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.exception(f"Exception in plan creation: {str(e)}")
            return Response(
                {'error': f'Failed to create plan: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        """Override to save selected objectives when creating plan"""
        try:
            plan = serializer.save()

            # Only save objectives that the planner actually selected (have planner_weight set)
            selected_objectives = StrategicObjective.objects.filter(
                planner_weight__isnull=False
            ).distinct()

            # If no objectives have planner_weight, fall back to the main strategic_objective
            if not selected_objectives.exists() and plan.strategic_objective:
                selected_objectives = StrategicObjective.objects.filter(id=plan.strategic_objective.id)

            # Save all selected objectives to the plan
            plan.selected_objectives.set(selected_objectives)

            logger.info(f"Plan {plan.id} created with {selected_objectives.count()} objectives")
        except Exception as e:
            logger.exception("Error creating plan with selected objectives")
            raise

    def perform_update(self, serializer):
        """Override to update selected objectives when updating plan"""
        try:
            plan = serializer.save()

            # If plan is being submitted, ensure all selected objectives are saved
            if plan.status == 'SUBMITTED':
                # Only save objectives that the planner actually selected (have planner_weight set)
                selected_objectives = StrategicObjective.objects.filter(
                    planner_weight__isnull=False
                ).distinct()

                # If no objectives have planner_weight, fall back to the main strategic_objective
                if not selected_objectives.exists() and plan.strategic_objective:
                    selected_objectives = StrategicObjective.objects.filter(id=plan.strategic_objective.id)

                # Update selected objectives
                plan.selected_objectives.set(selected_objectives)

                logger.info(f"Plan {plan.id} submitted with {selected_objectives.count()} objectives")
        except Exception as e:
            logger.exception("Error updating plan with selected objectives")
            raise

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit plan for review"""
        try:
            plan = self.get_object()

            if plan.status != 'DRAFT':
                return Response({'error': 'Only draft plans can be submitted'}, status=status.HTTP_400_BAD_REQUEST)

            # Only save objectives that the planner actually selected (have planner_weight set)
            selected_objectives = StrategicObjective.objects.filter(
                planner_weight__isnull=False
            ).distinct()

            # If no objectives have planner_weight, fall back to the main strategic_objective
            if not selected_objectives.exists() and plan.strategic_objective:
                selected_objectives = StrategicObjective.objects.filter(id=plan.strategic_objective.id)

            plan.selected_objectives.set(selected_objectives)
            plan.status = 'SUBMITTED'
            plan.save()

            return Response({'message': 'Plan submitted successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error submitting plan")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a submitted plan"""
        try:
            logger.info(f"Attempting to approve plan {pk} by user {request.user.username}")
            plan = self.get_object()

            if plan.status != 'SUBMITTED':
                logger.warning(f"Plan {pk} status is {plan.status}, not SUBMITTED")
                return Response({'error': 'Only submitted plans can be approved'}, status=status.HTTP_400_BAD_REQUEST)

            # Check if user has evaluator role
            user_organizations = OrganizationUser.objects.filter(user=request.user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'EVALUATOR' not in user_roles and 'ADMIN' not in user_roles:
                logger.warning(f"User {request.user.username} does not have evaluator/admin role")
                return Response({'error': 'Only evaluators can approve plans'}, status=status.HTTP_403_FORBIDDEN)

            # Get the evaluator's organization user record
            evaluator_org_user = user_organizations.filter(role__in=['EVALUATOR', 'ADMIN']).first()
            if not evaluator_org_user:
                logger.error(f"No evaluator organization record found for user {request.user.username}")
                return Response({'error': 'Evaluator organization record not found'}, status=status.HTTP_400_BAD_REQUEST)

            # Create review record
            review_data = {
                'plan': plan,
                'status': 'APPROVED',
                'feedback': request.data.get('feedback', ''),
                'evaluator': evaluator_org_user
            }

            logger.info(f"Creating review record for plan {pk}")
            review = PlanReview.objects.create(**review_data)

            # Update plan status
            plan.status = 'APPROVED'
            plan.save()

            logger.info(f"Plan {pk} approved successfully by {request.user.username}")
            return Response({'message': 'Plan approved successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Error approving plan {pk}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a submitted plan"""
        try:
            logger.info(f"Attempting to reject plan {pk} by user {request.user.username}")
            plan = self.get_object()

            if plan.status != 'SUBMITTED':
                logger.warning(f"Plan {pk} status is {plan.status}, not SUBMITTED")
                return Response({'error': 'Only submitted plans can be rejected'}, status=status.HTTP_400_BAD_REQUEST)

            # Check if user has evaluator role
            user_organizations = OrganizationUser.objects.filter(user=request.user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'EVALUATOR' not in user_roles and 'ADMIN' not in user_roles:
                logger.warning(f"User {request.user.username} does not have evaluator/admin role")
                return Response({'error': 'Only evaluators can reject plans'}, status=status.HTTP_403_FORBIDDEN)

            # Get the evaluator's organization user record
            evaluator_org_user = user_organizations.filter(role__in=['EVALUATOR', 'ADMIN']).first()
            if not evaluator_org_user:
                logger.error(f"No evaluator organization record found for user {request.user.username}")
                return Response({'error': 'Evaluator organization record not found'}, status=status.HTTP_400_BAD_REQUEST)

            # Create review record
            review_data = {
                'plan': plan,
                'status': 'REJECTED',
                'feedback': request.data.get('feedback', ''),
                'evaluator': evaluator_org_user
            }

            logger.info(f"Creating review record for plan {pk}")
            review = PlanReview.objects.create(**review_data)

            # Update plan status
            plan.status = 'REJECTED'
            plan.save()

            logger.info(f"Plan {pk} rejected successfully by {request.user.username}")
            return Response({'message': 'Plan rejected successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Error rejecting plan {pk}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_child_organizations(self, parent_org_id, all_orgs):
        """
        Recursively get all child organizations of a parent organization
        """
        child_ids = [parent_org_id]

        def get_descendants(org_id):
            children = [org.id for org in all_orgs if org.parent_id == org_id]
            for child_id in children:
                child_ids.append(child_id)
                get_descendants(child_id)

        get_descendants(parent_org_id)
        return child_ids

    def _get_admin_filtered_orgs(self, request):
        """
        Get the list of organization IDs that the admin can access based on hierarchy
        Returns (admin_org_id, admin_org_type, allowed_org_ids)
        """
        user_organizations = OrganizationUser.objects.filter(
            user=request.user,
            role='ADMIN'
        ).select_related('organization').first()

        if not user_organizations:
            return None, None, []

        admin_org = user_organizations.organization
        admin_org_id = admin_org.id
        admin_org_type = admin_org.type

        # If Minister, return all organizations
        if admin_org_type == 'MINISTER':
            return admin_org_id, admin_org_type, None

        # For other organization types, get all descendants
        all_orgs = list(Organization.objects.all())
        allowed_org_ids = self._get_child_organizations(admin_org_id, all_orgs)

        return admin_org_id, admin_org_type, allowed_org_ids

    @action(detail=False, methods=['get'])
    def pending_reviews(self, request):
        """Get plans pending review"""
        try:
            # Check if user is an evaluator
            user_organizations = OrganizationUser.objects.filter(user=request.user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'EVALUATOR' in user_roles:
                # Evaluators can see all submitted plans for review
                plans = Plan.objects.filter(status='SUBMITTED').select_related(
                    'organization', 'strategic_objective'
                ).prefetch_related('reviews', 'selected_objectives')
                logger.info(f"Evaluator {request.user.username} accessing {plans.count()} pending plans")
            elif 'ADMIN' in user_roles:
                # Admins see plans based on their organization hierarchy
                admin_org_id, admin_org_type, allowed_org_ids = self._get_admin_filtered_orgs(request)

                plans_query = Plan.objects.filter(status='SUBMITTED').select_related(
                    'organization', 'strategic_objective'
                ).prefetch_related('reviews', 'selected_objectives')

                # Filter by organization hierarchy
                if admin_org_type != 'MINISTER' and allowed_org_ids:
                    plans_query = plans_query.filter(organization__in=allowed_org_ids)

                plans = plans_query
                logger.info(f"Admin {request.user.username} accessing {plans.count()} pending plans")
            else:
                # For planners and others, use the normal filtered queryset
                plans = self.get_queryset().filter(status='SUBMITTED')
                logger.info(f"User {request.user.username} accessing {plans.count()} filtered pending plans")

            serializer = self.get_serializer(plans, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error fetching pending reviews")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='admin-analytics')
    def admin_analytics(self, request):
        """
        Get comprehensive analytics data for admin dashboard
        Filters data based on admin's organization hierarchy
        """
        try:
            user_organizations = OrganizationUser.objects.filter(user=request.user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'ADMIN' not in user_roles:
                return Response(
                    {'error': 'Only admins can access this endpoint'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get admin's organization filtering
            admin_org_id, admin_org_type, allowed_org_ids = self._get_admin_filtered_orgs(request)

            # Base query for plans
            plans_query = Plan.objects.select_related('organization', 'strategic_objective')

            # Apply organization hierarchy filtering
            if admin_org_type != 'MINISTER' and allowed_org_ids:
                plans_query = plans_query.filter(organization__in=allowed_org_ids)

            # Get all plans
            all_plans = plans_query

            # Get plans by status
            submitted_approved_plans = plans_query.filter(status__in=['SUBMITTED', 'APPROVED'])

            # Get sub-activities with proper filtering
            subactivities_query = SubActivity.objects.select_related('main_activity')

            if admin_org_type != 'MINISTER' and allowed_org_ids:
                # Filter sub-activities through main activities' organization
                subactivities_query = subactivities_query.filter(
                    main_activity__organization__in=allowed_org_ids
                )

            sub_activities = subactivities_query

            # Filter sub-activities for organizations with submitted/approved plans
            org_ids_with_plans = submitted_approved_plans.values_list('organization', flat=True)
            filtered_sub_activities = sub_activities.filter(
                main_activity__organization__in=org_ids_with_plans
            )

            # Calculate budget totals
            budget_data = filtered_sub_activities.aggregate(
                total_with_tool=Sum('estimated_cost_with_tool'),
                total_without_tool=Sum('estimated_cost_without_tool'),
                total_government=Sum('government_treasury'),
                total_partners=Sum('partners_funding'),
                total_sdg=Sum('sdg_funding'),
                total_other=Sum('other_funding')
            )

            # Calculate activity type budgets
            activity_budgets = {}
            for activity_type in ['Training', 'Meeting', 'Workshop', 'Supervision', 'Procurement', 'Printing', 'Other']:
                type_activities = filtered_sub_activities.filter(activity_type=activity_type)
                activity_budgets[activity_type] = {
                    'count': type_activities.count(),
                    'budget': sum(
                        float(sa.estimated_cost_with_tool if sa.budget_calculation_type == 'WITH_TOOL'
                              else sa.estimated_cost_without_tool)
                        for sa in type_activities
                    )
                }

            # Count plans by status
            total_plans = submitted_approved_plans.count()
            pending_count = plans_query.filter(status='SUBMITTED').count()
            approved_count = plans_query.filter(status='APPROVED').count()
            rejected_count = plans_query.filter(status='REJECTED').count()

            response_data = {
                'total_plans': total_plans,
                'pending_count': pending_count,
                'approved_count': approved_count,
                'rejected_count': rejected_count,
                'budget_totals': {
                    'total_with_tool': float(budget_data['total_with_tool'] or 0),
                    'total_without_tool': float(budget_data['total_without_tool'] or 0),
                    'government_total': float(budget_data['total_government'] or 0),
                    'partners_total': float(budget_data['total_partners'] or 0),
                    'sdg_total': float(budget_data['total_sdg'] or 0),
                    'other_total': float(budget_data['total_other'] or 0)
                },
                'activity_budgets': activity_budgets,
                'admin_org_type': admin_org_type,
                'filtered': admin_org_type != 'MINISTER'
            }

            return Response(response_data)

        except Exception as e:
            logger.exception("Error in admin_analytics")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='admin-detail')
    def admin_detail(self, request, pk=None):
        """
        Get plan details for admin view - returns ALL data without organization filtering.
        This endpoint uses AdminPlanSerializer which bypasses organization filtering.
        Only accessible to users with ADMIN role.
        """
        try:
            # Check if user is an admin
            user_organizations = OrganizationUser.objects.filter(user=request.user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'ADMIN' not in user_roles:
                logger.warning(f"Non-admin user {request.user.username} attempted to access admin_detail endpoint")
                return Response(
                    {'error': 'Only admins can access this endpoint'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get the plan without organization filtering
            plan = Plan.objects.select_related(
                'organization', 'strategic_objective'
            ).prefetch_related(
                'reviews', 'selected_objectives'
            ).get(pk=pk)

            logger.info(f"[ADMIN DETAIL] Admin {request.user.username} viewing plan {pk}")
            logger.info(f"[ADMIN DETAIL] Plan organization: {plan.organization.name}, status: {plan.status}")

            # Use AdminPlanSerializer which doesn't filter by organization
            serializer = AdminPlanSerializer(plan)

            logger.info(f"[ADMIN DETAIL] Returning admin plan data for plan {pk}")
            return Response(serializer.data)

        except Plan.DoesNotExist:
            logger.error(f"Plan {pk} not found")
            return Response({'error': 'Plan not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception(f"Error in admin_detail for plan {pk}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PlanReviewViewSet(viewsets.ModelViewSet):
    queryset = PlanReview.objects.all().select_related('plan', 'evaluator')
    serializer_class = PlanReviewSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan = self.request.query_params.get('plan', None)
        if plan is not None:
            queryset = queryset.filter(plan=plan)
        return queryset



# Costing Model ViewSets
class LocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Location.objects.all().order_by('region', 'name')
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]

class LandTransportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LandTransport.objects.all().select_related('origin', 'destination')
    serializer_class = LandTransportSerializer
    permission_classes = [IsAuthenticated]

class AirTransportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AirTransport.objects.all().select_related('origin', 'destination')
    serializer_class = AirTransportSerializer
    permission_classes = [IsAuthenticated]

class PerDiemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PerDiem.objects.all().select_related('location')
    serializer_class = PerDiemSerializer
    permission_classes = [IsAuthenticated]

class AccommodationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Accommodation.objects.all().select_related('location')
    serializer_class = AccommodationSerializer
    permission_classes = [IsAuthenticated]

class ParticipantCostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ParticipantCost.objects.all()
    serializer_class = ParticipantCostSerializer
    permission_classes = [IsAuthenticated]

class SessionCostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SessionCost.objects.all()
    serializer_class = SessionCostSerializer
    permission_classes = [IsAuthenticated]

class PrintingCostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PrintingCost.objects.all()
    serializer_class = PrintingCostSerializer
    permission_classes = [IsAuthenticated]

class SupervisorCostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SupervisorCost.objects.all()
    serializer_class = SupervisorCostSerializer
    permission_classes = [IsAuthenticated]

class ProcurementItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProcurementItem.objects.all().order_by('category', 'name')
    serializer_class = ProcurementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        category = self.request.query_params.get('category', None)
        if category is not None:
            queryset = queryset.filter(category=category)
        return queryset


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all().select_related('plan', 'organization', 'planner').prefetch_related('performance_achievements', 'activity_achievements', 'budget_utilizations')
    serializer_class = ReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        user_organizations = OrganizationUser.objects.filter(user=user)
        if not user_organizations.exists():
            return queryset.none()

        user_roles = user_organizations.values_list('role', flat=True)
        user_org_ids = user_organizations.values_list('organization', flat=True)

        plan_id = self.request.query_params.get('plan')
        report_type = self.request.query_params.get('report_type')

        if plan_id:
            queryset = queryset.filter(plan_id=plan_id)

        if report_type:
            queryset = queryset.filter(report_type=report_type)

        # Helper function to get all child organizations recursively
        def get_child_organizations(parent_org_id):
            child_ids = [parent_org_id]

            def get_descendants(org_id):
                children = Organization.objects.filter(parent_id=org_id).values_list('id', flat=True)
                for child_id in children:
                    if child_id not in child_ids:
                        child_ids.append(child_id)
                        get_descendants(child_id)

            get_descendants(parent_org_id)
            return child_ids

        if 'ADMIN' in user_roles:
            admin_org = user_organizations.first().organization
            admin_org_id = admin_org.id

            # Get all child organizations in the hierarchy
            allowed_org_ids = get_child_organizations(admin_org_id)

            queryset = queryset.filter(organization__in=allowed_org_ids)
            logger.info(f"Admin {user.username} accessing reports from organization hierarchy: {allowed_org_ids}")
            return queryset

        return queryset.filter(organization__in=user_org_ids)

    def update(self, request, *args, **kwargs):
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()

            logger.info(f"Updating report {instance.id} - Partial: {partial}")
            logger.info(f"Request data keys: {request.data.keys()}")
            logger.info(f"Request FILES keys: {request.FILES.keys()}")

            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            logger.info(f"Report {instance.id} updated successfully")
            return Response(serializer.data)

        except Exception as e:
            logger.exception(f"Error updating report {kwargs.get('pk')}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def create(self, request, *args, **kwargs):
        try:
            plan_id = request.data.get('plan')
            report_type = request.data.get('report_type')

            logger.info(f"Report creation requested - Plan ID: {plan_id}, Report Type: {report_type}")

            if not plan_id or not report_type:
                return Response({'error': 'Plan and report type are required'}, status=status.HTTP_400_BAD_REQUEST)

            existing_report = Report.objects.filter(plan_id=plan_id, report_type=report_type).first()
            if existing_report:
                logger.info(f"Found existing report {existing_report.id} with status {existing_report.status}")
                if existing_report.status == 'SUBMITTED':
                    return Response({
                        'error': 'This report has already been submitted and is awaiting evaluation. You cannot modify it.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if existing_report.status == 'APPROVED':
                    return Response({
                        'error': 'This report has been approved and cannot be modified.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                serializer = self.get_serializer(existing_report)
                return Response(serializer.data, status=status.HTTP_200_OK)

            plan = Plan.objects.get(id=plan_id)
            logger.info(f"Plan found - Status: {plan.status}, Start: {plan.from_date}, End: {plan.to_date}")

            if plan.status != 'APPROVED':
                return Response({'error': 'Can only create reports for approved plans'}, status=status.HTTP_400_BAD_REQUEST)

            from datetime import date
            from dateutil.relativedelta import relativedelta

            current_date = date.today()
            plan_start = plan.from_date
            report_period_end = None

            if report_type == 'Q1':
                report_period_end = plan_start + relativedelta(months=3)
            elif report_type == 'Q2':
                report_period_end = plan_start + relativedelta(months=6)
            elif report_type == '6M':
                report_period_end = plan_start + relativedelta(months=6)
            elif report_type == 'Q3':
                report_period_end = plan_start + relativedelta(months=9)
            elif report_type == '9M':
                report_period_end = plan_start + relativedelta(months=9)
            elif report_type == 'Q4':
                report_period_end = plan_start + relativedelta(months=12)
            elif report_type == 'YEARLY':
                report_period_end = plan.to_date

            logger.info(f"Report type: {report_type}, Period end: {report_period_end}, Current date: {current_date}")

            if report_period_end and current_date < report_period_end:
                error_msg = f'You are not allowed to report now. The reporting period for {report_type} has not ended yet. Please wait until {report_period_end.strftime("%B %d, %Y")}.'
                logger.warning(f"Report creation blocked: {error_msg}")
                return Response({
                    'error': error_msg,
                    'report_period_end': report_period_end.strftime("%Y-%m-%d"),
                    'current_date': current_date.strftime("%Y-%m-%d")
                }, status=status.HTTP_400_BAD_REQUEST)

            request.data['organization'] = plan.organization.id
            request.data['planner'] = request.user.id

            logger.info(f"Creating report for plan {plan_id}, type {report_type}")
            return super().create(request, *args, **kwargs)

        except Plan.DoesNotExist:
            logger.error(f"Plan {plan_id} not found")
            return Response({'error': 'Plan not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Error creating report")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        try:
            logger.info(f"Attempting to submit report {pk}")
            report = self.get_object()
            logger.info(f"Report found - Status: {report.status}, ID: {report.id}")

            if report.status == 'SUBMITTED':
                logger.warning(f"Report {pk} is already submitted")
                return Response({'error': 'Report already submitted'}, status=status.HTTP_400_BAD_REQUEST)

            if report.status == 'APPROVED':
                logger.warning(f"Report {pk} is already approved")
                return Response({'error': 'Report already approved'}, status=status.HTTP_400_BAD_REQUEST)

            logger.info(f"Updating report {pk} status to SUBMITTED")
            report.status = 'SUBMITTED'
            report.submitted_at = timezone.now()
            report.save()
            logger.info(f"Report {pk} submitted successfully")

            return Response({'message': 'Report submitted successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Error submitting report {pk}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            report = self.get_object()
            user = request.user

            user_organizations = OrganizationUser.objects.filter(user=user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'EVALUATOR' not in user_roles and 'ADMIN' not in user_roles:
                return Response({'error': 'Only evaluators can approve reports'}, status=status.HTTP_403_FORBIDDEN)

            if report.status != 'SUBMITTED':
                return Response({'error': 'Can only approve submitted reports'}, status=status.HTTP_400_BAD_REQUEST)

            report.status = 'APPROVED'
            report.evaluator = user
            report.evaluated_at = timezone.now()
            report.evaluator_feedback = request.data.get('feedback', '')
            report.save()

            return Response({'message': 'Report approved successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error approving report")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def download_narrative(self, request, pk=None):
        """Download narrative report file"""
        from django.http import FileResponse, Http404
        import os

        try:
            report = self.get_object()

            if not report.narrative_report:
                raise Http404("Narrative report not found")

            file_path = report.narrative_report.path

            if not os.path.exists(file_path):
                raise Http404("File not found")

            response = FileResponse(
                open(file_path, 'rb'),
                content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            )

            filename = os.path.basename(file_path)
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            return response

        except Http404:
            raise
        except Exception as e:
            logger.exception("Error downloading narrative report")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        try:
            report = self.get_object()
            user = request.user

            user_organizations = OrganizationUser.objects.filter(user=user)
            user_roles = user_organizations.values_list('role', flat=True)

            if 'EVALUATOR' not in user_roles and 'ADMIN' not in user_roles:
                return Response({'error': 'Only evaluators can reject reports'}, status=status.HTTP_403_FORBIDDEN)

            if report.status != 'SUBMITTED':
                return Response({'error': 'Can only reject submitted reports'}, status=status.HTTP_400_BAD_REQUEST)

            feedback = request.data.get('feedback', '')
            if not feedback:
                return Response({'error': 'Feedback is required when rejecting a report'}, status=status.HTTP_400_BAD_REQUEST)

            report.status = 'REJECTED'
            report.evaluator = user
            report.evaluated_at = timezone.now()
            report.evaluator_feedback = feedback
            report.save()

            return Response({'message': 'Report rejected successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error rejecting report")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def resubmit(self, request, pk=None):
        try:
            logger.info(f"Attempting to resubmit report {pk}")
            report = self.get_object()
            logger.info(f"Report found - Status: {report.status}, ID: {report.id}")

            if report.status != 'REJECTED':
                logger.warning(f"Report {pk} status is {report.status}, not REJECTED")
                return Response({'error': 'Can only resubmit rejected reports'}, status=status.HTTP_400_BAD_REQUEST)

            logger.info(f"Resubmitting report {pk}")
            report.status = 'SUBMITTED'
            report.submitted_at = timezone.now()
            report.evaluated_at = None
            report.save()
            logger.info(f"Report {pk} resubmitted successfully")

            return Response({'message': 'Report resubmitted successfully'}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Error resubmitting report {pk}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def plan_data(self, request, pk=None):
        try:
            report = self.get_object()
            plan = report.plan
            report_type = report.report_type

            logger.info(f"Fetching plan data for report {pk}, plan {plan.id}, type {report_type}")

            objectives = plan.selected_objectives.all()
            logger.info(f"Found {objectives.count()} selected objectives in plan")

            plan_data = []

            for objective in objectives:
                logger.info(f"Processing objective: {objective.id} - {objective.title}")

                initiatives = objective.initiatives.filter(
                    Q(organization=plan.organization) | Q(organization__isnull=True)
                )
                logger.info(f"Found {initiatives.count()} initiatives for objective {objective.id}")

                for initiative in initiatives:
                    logger.info(f"Processing initiative: {initiative.id} - {initiative.name}")

                    measures = initiative.performance_measures.filter(
                        Q(organization=plan.organization) | Q(organization__isnull=True)
                    )
                    activities = initiative.main_activities.filter(
                        Q(organization=plan.organization) | Q(organization__isnull=True)
                    )

                    logger.info(f"Initiative {initiative.id} has {measures.count()} measures and {activities.count()} activities")

                    initiative_data = {
                        'objective_id': objective.id,
                        'objective_title': objective.title,
                        'objective_weight': float(plan.selected_objectives_weights.get(str(objective.id), 0)) if plan.selected_objectives_weights else 0,
                        'initiative_id': initiative.id,
                        'initiative_name': initiative.name,
                        'initiative_weight': float(initiative.weight or 0),
                        'performance_measures': [],
                        'main_activities': []
                    }

                    for measure in measures:
                        logger.info(f"Processing measure {measure.id}: {measure.name}, target_type: {measure.target_type}")
                        target = self._get_target_for_period(measure, report_type)
                        logger.info(f"Calculated target for measure {measure.id}: {target}")

                        if target is not None and target > 0:
                            initiative_data['performance_measures'].append({
                                'id': measure.id,
                                'name': measure.name,
                                'weight': float(measure.weight or 0),
                                'target': float(target),
                                'target_type': measure.target_type
                            })
                        else:
                            logger.warning(f"Skipping measure {measure.id} - no valid target for {report_type}")

                    for activity in activities:
                        logger.info(f"Processing activity {activity.id}: {activity.name}, target_type: {activity.target_type}")
                        target = self._get_target_for_period(activity, report_type)
                        logger.info(f"Calculated target for activity {activity.id}: {target}")

                        if target is not None and target > 0:
                            sub_activities_data = []
                            sub_activities_qs = activity.sub_activities.all()
                            logger.info(f"Activity {activity.id} has {sub_activities_qs.count()} sub-activities")

                            for sub_activity in sub_activities_qs:
                                logger.info(f"Processing sub-activity {sub_activity.id}: {sub_activity.name}")
                                logger.info(f"Budget values - Treasury: {sub_activity.government_treasury}, SDG: {sub_activity.sdg_funding}, Partners: {sub_activity.partners_funding}, Other: {sub_activity.other_funding}")

                                sub_activities_data.append({
                                    'id': sub_activity.id,
                                    'name': sub_activity.name,
                                    'activity_type': sub_activity.activity_type,
                                    'government_treasury': float(sub_activity.government_treasury),
                                    'sdg_funding': float(sub_activity.sdg_funding),
                                    'partners_funding': float(sub_activity.partners_funding),
                                    'other_funding': float(sub_activity.other_funding),
                                })

                            logger.info(f"Total sub_activities_data items: {len(sub_activities_data)}")

                            initiative_data['main_activities'].append({
                                'id': activity.id,
                                'name': activity.name,
                                'weight': float(activity.weight or 0),
                                'target': float(target),
                                'target_type': activity.target_type,
                                'sub_activities': sub_activities_data
                            })
                        else:
                            logger.warning(f"Skipping activity {activity.id} - no valid target for {report_type}")

                    if initiative_data['performance_measures'] or initiative_data['main_activities']:
                        plan_data.append(initiative_data)
                        logger.info(f"Added initiative {initiative.id} to plan_data")
                    else:
                        logger.warning(f"Skipping initiative {initiative.id} - no valid measures or activities")

            logger.info(f"Returning {len(plan_data)} initiative entries for report {pk}")

            me_data = self._build_me_data(report)

            return Response({
                'plan_data': plan_data,
                'me_data': me_data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error fetching plan data for report")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _build_me_data(self, report):
        """Build M&E report data structure with achievements"""
        plan = report.plan
        objectives = plan.selected_objectives.all()
        me_data = []

        for objective in objectives:
            objective_weight = float(plan.selected_objectives_weights.get(str(objective.id), 0)) if plan.selected_objectives_weights else 0

            initiatives_data = []
            initiatives = objective.initiatives.filter(
                Q(organization=plan.organization) | Q(organization__isnull=True)
            )

            for initiative in initiatives:
                measures = initiative.performance_measures.filter(
                    Q(organization=plan.organization) | Q(organization__isnull=True)
                )
                activities = initiative.main_activities.filter(
                    Q(organization=plan.organization) | Q(organization__isnull=True)
                )

                measures_data = []
                for measure in measures:
                    target = self._get_target_for_period(measure, report.report_type)
                    if target and target > 0:
                        achievement_record = report.performance_achievements.filter(performance_measure=measure).first()
                        measures_data.append({
                            'id': measure.id,
                            'name': measure.name,
                            'weight': float(measure.weight or 0),
                            'target': float(target),
                            'achievement': float(achievement_record.achievement) if achievement_record else 0,
                            'justification': achievement_record.justification if achievement_record else ''
                        })

                activities_data = []
                for activity in activities:
                    target = self._get_target_for_period(activity, report.report_type)
                    if target and target > 0:
                        achievement_record = report.activity_achievements.filter(main_activity=activity).first()

                        sub_activities_data = []
                        # Only include sub-activities that have budget utilization data for this report
                        # This ensures we only show sub-activities planned for this specific report period
                        sub_activity_ids_with_budget = report.budget_utilizations.values_list('sub_activity_id', flat=True)
                        filtered_sub_activities = activity.sub_activities.filter(id__in=sub_activity_ids_with_budget)

                        for sub_activity in filtered_sub_activities:
                            budget_util = report.budget_utilizations.filter(sub_activity=sub_activity).first()

                            total_budget = (
                                float(sub_activity.government_treasury) +
                                float(sub_activity.sdg_funding) +
                                float(sub_activity.partners_funding) +
                                float(sub_activity.other_funding)
                            )

                            total_utilized = 0
                            if budget_util:
                                total_utilized = (
                                    float(budget_util.government_treasury_utilized) +
                                    float(budget_util.sdg_funding_utilized) +
                                    float(budget_util.partners_funding_utilized) +
                                    float(budget_util.other_funding_utilized)
                                )

                            sub_activities_data.append({
                                'id': sub_activity.id,
                                'name': sub_activity.name,
                                'activity_type': sub_activity.activity_type,
                                'government_treasury': float(sub_activity.government_treasury),
                                'sdg_funding': float(sub_activity.sdg_funding),
                                'partners_funding': float(sub_activity.partners_funding),
                                'other_funding': float(sub_activity.other_funding),
                                'government_treasury_utilized': float(budget_util.government_treasury_utilized) if budget_util else 0,
                                'sdg_funding_utilized': float(budget_util.sdg_funding_utilized) if budget_util else 0,
                                'partners_funding_utilized': float(budget_util.partners_funding_utilized) if budget_util else 0,
                                'other_funding_utilized': float(budget_util.other_funding_utilized) if budget_util else 0,
                                'total_budget': total_budget,
                                'total_utilized': total_utilized,
                                'remaining_budget': total_budget - total_utilized
                            })

                        activities_data.append({
                            'id': activity.id,
                            'name': activity.name,
                            'weight': float(activity.weight or 0),
                            'target': float(target),
                            'achievement': float(achievement_record.achievement) if achievement_record else 0,
                            'justification': achievement_record.justification if achievement_record else '',
                            'subActivities': sub_activities_data
                        })

                if measures_data or activities_data:
                    initiatives_data.append({
                        'id': initiative.id,
                        'name': initiative.name,
                        'weight': float(initiative.weight or 0),
                        'performanceMeasures': measures_data,
                        'mainActivities': activities_data
                    })

            if initiatives_data:
                me_data.append({
                    'id': objective.id,
                    'title': objective.title,
                    'weight': objective_weight,
                    'initiatives': initiatives_data
                })

        return me_data

    @action(detail=True, methods=['get'])
    def debug_plan_structure(self, request, pk=None):
        """Debug endpoint to inspect plan structure"""
        try:
            report = self.get_object()
            plan = report.plan

            debug_info = {
                'report_id': report.id,
                'report_type': report.report_type,
                'plan_id': plan.id,
                'plan_status': plan.status,
                'plan_organization': plan.organization.name,
                'selected_objectives_count': plan.selected_objectives.count(),
                'objectives': []
            }

            for objective in plan.selected_objectives.all():
                obj_info = {
                    'id': objective.id,
                    'title': objective.title,
                    'weight': float(plan.selected_objectives_weights.get(str(objective.id), 0)) if plan.selected_objectives_weights else 0,
                    'initiatives_count': objective.initiatives.count(),
                    'initiatives': []
                }

                for initiative in objective.initiatives.all():
                    init_info = {
                        'id': initiative.id,
                        'name': initiative.name,
                        'weight': float(initiative.weight or 0),
                        'organization': initiative.organization.name if initiative.organization else 'None (Default)',
                        'measures_count': initiative.performance_measures.count(),
                        'activities_count': initiative.main_activities.count(),
                        'measures': [],
                        'activities': []
                    }

                    for measure in initiative.performance_measures.all():
                        init_info['measures'].append({
                            'id': measure.id,
                            'name': measure.name,
                            'target_type': measure.target_type,
                            'organization': measure.organization.name if measure.organization else 'None (Default)',
                            'q1_target': float(measure.q1_target) if measure.q1_target else None,
                            'q2_target': float(measure.q2_target) if measure.q2_target else None,
                            'q3_target': float(measure.q3_target) if measure.q3_target else None,
                            'q4_target': float(measure.q4_target) if measure.q4_target else None,
                            'annual_target': float(measure.annual_target) if measure.annual_target else None,
                        })

                    for activity in initiative.main_activities.all():
                        init_info['activities'].append({
                            'id': activity.id,
                            'name': activity.name,
                            'target_type': activity.target_type,
                            'organization': activity.organization.name if activity.organization else 'None (Default)',
                            'q1_target': float(activity.q1_target) if activity.q1_target else None,
                            'q2_target': float(activity.q2_target) if activity.q2_target else None,
                            'q3_target': float(activity.q3_target) if activity.q3_target else None,
                            'q4_target': float(activity.q4_target) if activity.q4_target else None,
                            'annual_target': float(activity.annual_target) if activity.annual_target else None,
                        })

                    obj_info['initiatives'].append(init_info)

                debug_info['objectives'].append(obj_info)

            return Response(debug_info, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error in debug_plan_structure")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_target_for_period(self, obj, report_type):
        """
        Get the target value for a specific reporting period.
        Filters based on selected_quarters/selected_months and returns appropriate target.
        """
        # Get selected periods
        selected_quarters = obj.selected_quarters if hasattr(obj, 'selected_quarters') and obj.selected_quarters else []
        selected_months = obj.selected_months if hasattr(obj, 'selected_months') and obj.selected_months else []

        # Map report types to quarters
        report_quarters_map = {
            'Q1': ['Q1'],
            'Q2': ['Q2'],
            'Q3': ['Q3'],
            'Q4': ['Q4'],
            '6M': ['Q1', 'Q2'],
            '9M': ['Q1', 'Q2', 'Q3'],
            'YEARLY': ['Q1', 'Q2', 'Q3', 'Q4']
        }

        # Map quarters to months (using abbreviated format matching frontend)
        quarter_months_map = {
            'Q1': ['JUL', 'AUG', 'SEP'],
            'Q2': ['OCT', 'NOV', 'DEC'],
            'Q3': ['JAN', 'FEB', 'MAR'],
            'Q4': ['APR', 'MAY', 'JUN']
        }

        # Check if this activity/measure is planned for the report period
        required_quarters = report_quarters_map.get(report_type, [])

        # Check if any of the required quarters are in selected_quarters
        has_matching_quarter = any(q in selected_quarters for q in required_quarters)

        # Check if any months from required quarters are in selected_months
        has_matching_month = False
        if selected_months:
            required_months = []
            for q in required_quarters:
                required_months.extend(quarter_months_map.get(q, []))
            has_matching_month = any(m in selected_months for m in required_months)

        # If not planned for this period, return None
        if not has_matching_quarter and not has_matching_month:
            return None

        # Check if quarterly targets are defined (non-zero)
        has_quarterly = any([
            obj.q1_target and obj.q1_target > 0,
            obj.q2_target and obj.q2_target > 0,
            obj.q3_target and obj.q3_target > 0,
            obj.q4_target and obj.q4_target > 0
        ])

        if has_quarterly:
            # Use quarterly targets
            if report_type == 'Q1':
                return obj.q1_target if obj.q1_target else None
            elif report_type == 'Q2':
                return obj.q2_target if obj.q2_target else None
            elif report_type == '6M':
                q1 = obj.q1_target if obj.q1_target else 0
                q2 = obj.q2_target if obj.q2_target else 0
                return q1 + q2 if (q1 or q2) else None
            elif report_type == 'Q3':
                return obj.q3_target if obj.q3_target else None
            elif report_type == '9M':
                q1 = obj.q1_target if obj.q1_target else 0
                q2 = obj.q2_target if obj.q2_target else 0
                q3 = obj.q3_target if obj.q3_target else 0
                return q1 + q2 + q3 if (q1 or q2 or q3) else None
            elif report_type == 'Q4':
                return obj.q4_target if obj.q4_target else None
            elif report_type == 'YEARLY':
                q1 = obj.q1_target if obj.q1_target else 0
                q2 = obj.q2_target if obj.q2_target else 0
                q3 = obj.q3_target if obj.q3_target else 0
                q4 = obj.q4_target if obj.q4_target else 0
                return q1 + q2 + q3 + q4 if (q1 or q2 or q3 or q4) else None
        else:
            # Fall back to annual target and divide by period
            annual = obj.annual_target if hasattr(obj, 'annual_target') and obj.annual_target else None
            if not annual or annual == 0:
                return None

            if report_type == 'YEARLY':
                return annual
            elif report_type in ['Q1', 'Q2', 'Q3', 'Q4']:
                return annual / 4
            elif report_type == '6M':
                return annual / 2
            elif report_type == '9M':
                return annual * 3 / 4

        return None


class PerformanceAchievementViewSet(viewsets.ModelViewSet):
    queryset = PerformanceAchievement.objects.all().select_related('report', 'performance_measure')
    serializer_class = PerformanceAchievementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        report_id = self.request.query_params.get('report', None)
        if report_id:
            queryset = queryset.filter(report_id=report_id)
        return queryset

    @action(detail=False, methods=['post'])
    def bulk_create_or_update(self, request):
        try:
            achievements = request.data.get('achievements', [])
            report_id = request.data.get('report_id')

            if not report_id:
                return Response({'error': 'Report ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            # Get the report to validate period filtering
            try:
                report = Report.objects.get(id=report_id)
            except Report.DoesNotExist:
                return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)

            created_or_updated = []
            valid_measure_ids = [a.get('performance_measure') for a in achievements if a.get('performance_measure')]

            with transaction.atomic():
                # Delete achievements that are no longer in the list (removed from period)
                PerformanceAchievement.objects.filter(
                    report_id=report_id
                ).exclude(
                    performance_measure_id__in=valid_measure_ids
                ).delete()

                # Create or update achievements for current period
                for achievement_data in achievements:
                    performance_measure_id = achievement_data.get('performance_measure')

                    if not performance_measure_id:
                        continue

                    obj, created = PerformanceAchievement.objects.update_or_create(
                        report_id=report_id,
                        performance_measure_id=performance_measure_id,
                        defaults={
                            'achievement': achievement_data.get('achievement', 0),
                            'justification': achievement_data.get('justification', ''),
                        }
                    )
                    created_or_updated.append(obj)

            serializer = self.get_serializer(created_or_updated, many=True)
            return Response({
                'message': f'Successfully saved {len(created_or_updated)} performance achievements',
                'data': serializer.data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error in bulk create/update performance achievements")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ActivityAchievementViewSet(viewsets.ModelViewSet):
    queryset = ActivityAchievement.objects.all().select_related('report', 'main_activity')
    serializer_class = ActivityAchievementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        report_id = self.request.query_params.get('report', None)
        if report_id:
            queryset = queryset.filter(report_id=report_id)
        return queryset

    @action(detail=False, methods=['post'])
    def bulk_create_or_update(self, request):
        try:
            achievements = request.data.get('achievements', [])
            report_id = request.data.get('report_id')

            if not report_id:
                return Response({'error': 'Report ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            # Get the report to validate period filtering
            try:
                report = Report.objects.get(id=report_id)
            except Report.DoesNotExist:
                return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)

            created_or_updated = []
            valid_activity_ids = [a.get('main_activity') for a in achievements if a.get('main_activity')]

            with transaction.atomic():
                # Delete achievements that are no longer in the list (removed from period)
                ActivityAchievement.objects.filter(
                    report_id=report_id
                ).exclude(
                    main_activity_id__in=valid_activity_ids
                ).delete()

                # Create or update achievements for current period
                for achievement_data in achievements:
                    main_activity_id = achievement_data.get('main_activity')

                    if not main_activity_id:
                        continue

                    obj, created = ActivityAchievement.objects.update_or_create(
                        report_id=report_id,
                        main_activity_id=main_activity_id,
                        defaults={
                            'achievement': achievement_data.get('achievement', 0),
                            'justification': achievement_data.get('justification', ''),
                        }
                    )
                    created_or_updated.append(obj)

            serializer = self.get_serializer(created_or_updated, many=True)
            return Response({
                'message': f'Successfully saved {len(created_or_updated)} activity achievements',
                'data': serializer.data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error in bulk create/update activity achievements")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SubActivityBudgetUtilizationViewSet(viewsets.ModelViewSet):
    queryset = SubActivityBudgetUtilization.objects.all().select_related('report', 'sub_activity')
    serializer_class = SubActivityBudgetUtilizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        report_id = self.request.query_params.get('report', None)
        if report_id:
            queryset = queryset.filter(report_id=report_id)
        return queryset

    @action(detail=False, methods=['post'])
    def bulk_create_or_update(self, request):
        try:
            budget_utilizations = request.data.get('budget_utilizations', [])
            report_id = request.data.get('report_id')

            if not report_id:
                return Response({'error': 'Report ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            # Get the report to validate period filtering
            try:
                report = Report.objects.get(id=report_id)
            except Report.DoesNotExist:
                return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)

            created_or_updated = []
            valid_subactivity_ids = [u.get('sub_activity') for u in budget_utilizations if u.get('sub_activity')]

            with transaction.atomic():
                # Delete budget utilizations that are no longer in the list (removed from period)
                SubActivityBudgetUtilization.objects.filter(
                    report_id=report_id
                ).exclude(
                    sub_activity_id__in=valid_subactivity_ids
                ).delete()

                # Create or update budget utilizations for current period
                for util_data in budget_utilizations:
                    sub_activity_id = util_data.get('sub_activity')

                    if not sub_activity_id:
                        continue

                    obj, created = SubActivityBudgetUtilization.objects.update_or_create(
                        report_id=report_id,
                        sub_activity_id=sub_activity_id,
                        defaults={
                            'government_treasury_utilized': util_data.get('government_treasury_utilized', 0),
                            'sdg_funding_utilized': util_data.get('sdg_funding_utilized', 0),
                            'partners_funding_utilized': util_data.get('partners_funding_utilized', 0),
                            'other_funding_utilized': util_data.get('other_funding_utilized', 0),
                        }
                    )
                    created_or_updated.append(obj)

            serializer = self.get_serializer(created_or_updated, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Error in bulk create/update budget utilization")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def report_statistics(request):
    """
    Get report statistics including:
    - Organizations that submitted reports vs not submitted
    - Strategic objective achievement percentages with color coding (grouped by organization)
    - Organization M&E reports (approved only)
    - Budget utilization by source

    Applies organization hierarchy filtering based on admin's organization:
    - Minister: sees all organizations
    - State Ministers: see only their organizational hierarchy children
    - Other admins: see only their organization
    """
    try:
        from django.db.models import Q, Count, Avg, Sum, F, Case, When, DecimalField
        from decimal import Decimal

        # Helper function to get child organizations recursively
        def get_child_organizations(parent_org_id, all_orgs):
            child_ids = [parent_org_id]

            def get_descendants(org_id):
                for org in all_orgs:
                    # Access parent_id directly (Django creates this field automatically)
                    parent_id = getattr(org, 'parent_id', None)
                    if parent_id == org_id:
                        child_ids.append(org.id)
                        get_descendants(org.id)

            get_descendants(parent_org_id)
            return child_ids

        # Determine user's allowed organizations based on role
        user_orgs = request.user.organization_users.all()
        allowed_org_ids = None  # Default: no filtering (show all)

        if user_orgs.exists():
            # Get user's roles
            user_roles = [uo.role for uo in user_orgs]

            # Only apply filtering for admin users
            if 'ADMIN' in user_roles:
                admin_org = user_orgs.first().organization
                admin_org_id = admin_org.id
                admin_org_type = admin_org.type

                # Determine which organizations this admin can access
                if admin_org_type == 'MINISTER':
                    # Minister sees all organizations
                    allowed_org_ids = None  # None means no filtering
                else:
                    # For other organization types, get all descendants
                    all_orgs = list(Organization.objects.all())
                    allowed_org_ids = get_child_organizations(admin_org_id, all_orgs)
            # Evaluators and Planners see all organizations by default

        # Get all organizations with approved plans (apply filtering)
        approved_plans_query = Plan.objects.filter(status='APPROVED')
        if allowed_org_ids is not None:
            approved_plans_query = approved_plans_query.filter(organization__in=allowed_org_ids)

        approved_plans = approved_plans_query
        orgs_with_approved_plans = approved_plans.values_list('organization_id', flat=True).distinct()

        # Get organizations that have submitted reports (apply filtering)
        orgs_with_reports_query = Report.objects.filter(status__in=['SUBMITTED', 'APPROVED'])
        if allowed_org_ids is not None:
            orgs_with_reports_query = orgs_with_reports_query.filter(organization__in=allowed_org_ids)

        orgs_with_reports = orgs_with_reports_query.values_list('organization_id', flat=True).distinct()

        # Calculate submission stats
        total_orgs = Organization.objects.filter(id__in=orgs_with_approved_plans).count()
        submitted_count = len(set(orgs_with_reports))
        not_submitted_count = total_orgs - submitted_count

        # Get strategic objective achievements grouped by organization (apply filtering)
        objective_achievements_by_org = []
        organizations = Organization.objects.filter(id__in=orgs_with_approved_plans)

        for org in organizations:
            org_reports = Report.objects.filter(
                organization=org,
                status__in=['SUBMITTED', 'APPROVED']
            )

            if not org_reports.exists():
                continue

            strategic_objectives = StrategicObjective.objects.all()
            org_objectives = []

            for objective in strategic_objectives:
                # Get all performance measures under this objective (through initiatives)
                initiatives = objective.initiatives.all()
                measure_ids = PerformanceMeasure.objects.filter(
                    initiative__in=initiatives,
                    organization=org
                ).values_list('id', flat=True)

                if not measure_ids:
                    continue

                # Get achievements for these measures from this org's reports
                achievements = PerformanceAchievement.objects.filter(
                    performance_measure_id__in=measure_ids,
                    report__in=org_reports
                ).select_related('performance_measure')

                if not achievements.exists():
                    continue

                # Calculate achievement percentage for each measure
                total_percentage = Decimal('0')
                measure_count = 0

                for achievement in achievements:
                    measure = achievement.performance_measure
                    report = achievement.report

                    # Get the target for the specific report period, not annual
                    target = ReportViewSet()._get_target_for_period(measure, report.report_type)

                    if target and target > 0:
                        achievement_percent = (Decimal(str(achievement.achievement)) / Decimal(str(target))) * 100
                        total_percentage += achievement_percent
                        measure_count += 1

                if measure_count > 0:
                    avg_percentage = float(total_percentage / measure_count)

                    # Determine color based on percentage
                    color = '#F2250A'  # Red (default)
                    if avg_percentage >= 95:
                        color = '#00A300'  # Dark Green
                    elif avg_percentage >= 80:
                        color = '#93C572'  # Light Green
                    elif avg_percentage >= 65:
                        color = '#FFFF00'  # Dark Yellow
                    elif avg_percentage >= 55:
                        color = '#FFBF00'  # Light Yellow

                    org_objectives.append({
                        'id': objective.id,
                        'title': objective.title,
                        'achievement_percentage': round(avg_percentage, 2),
                        'color': color
                    })

            if org_objectives:
                objective_achievements_by_org.append({
                    'organization_id': org.id,
                    'organization_name': org.name,
                    'organization_code': f'ORG-{org.id:04d}',
                    'objectives': org_objectives
                })

        # Get organization M&E reports (approved only, apply filtering)
        organization_reports = []
        approved_reports_query = Report.objects.filter(status='APPROVED')
        if allowed_org_ids is not None:
            approved_reports_query = approved_reports_query.filter(organization__in=allowed_org_ids)

        approved_reports = approved_reports_query.select_related('organization', 'plan').prefetch_related(
            'performance_achievements__performance_measure',
            'activity_achievements__main_activity',
            'budget_utilizations__sub_activity'
        ).order_by('organization__name', '-report_date')

        for report in approved_reports:
            # Calculate overall achievement percentage
            achievements = report.performance_achievements.all()
            total_percentage = Decimal('0')
            measure_count = 0

            for achievement in achievements:
                measure = achievement.performance_measure

                # Get the target for the specific report period, not annual
                target = ReportViewSet()._get_target_for_period(measure, report.report_type)

                if target and target > 0:
                    achievement_percent = (Decimal(str(achievement.achievement)) / Decimal(str(target))) * 100
                    total_percentage += achievement_percent
                    measure_count += 1

            avg_achievement = float(total_percentage / measure_count) if measure_count > 0 else 0

            # Calculate budget utilization and total budget
            budget_utils = report.budget_utilizations.all()
            total_govt_utilized = sum(float(bu.government_treasury_utilized or 0) for bu in budget_utils)
            total_sdg_utilized = sum(float(bu.sdg_funding_utilized or 0) for bu in budget_utils)
            total_partners_utilized = sum(float(bu.partners_funding_utilized or 0) for bu in budget_utils)
            total_other_utilized = sum(float(bu.other_funding_utilized or 0) for bu in budget_utils)

            # Calculate total budget from sub-activities
            total_govt_budget = Decimal('0')
            total_sdg_budget = Decimal('0')
            total_partners_budget = Decimal('0')
            total_other_budget = Decimal('0')

            if report.plan:
                try:
                    # Get all sub-activities for the plan through the selected objectives
                    # Include activities from both default initiatives (organization=NULL)
                    # and custom initiatives from this organization
                    # ONLY include activities that have valid targets for this report period
                    selected_obj_ids = list(report.plan.selected_objectives.values_list('id', flat=True))

                    if selected_obj_ids:
                        initiatives = StrategicInitiative.objects.filter(
                            strategic_objective_id__in=selected_obj_ids
                        ).filter(
                            Q(organization=report.organization) |
                            Q(organization__isnull=True)
                        )

                        activities = MainActivity.objects.filter(
                            initiative__in=initiatives
                        ).filter(
                            Q(organization=report.organization) |
                            Q(organization__isnull=True)
                        )

                        # Filter activities by those that have valid targets for this report period
                        valid_activity_ids = []
                        for activity in activities:
                            target = ReportViewSet()._get_target_for_period(activity, report.report_type)
                            if target and target > 0:
                                valid_activity_ids.append(activity.id)

                        # Get sub-activities only for activities with valid targets
                        sub_activities = SubActivity.objects.filter(
                            main_activity_id__in=valid_activity_ids
                        )

                        for sub_activity in sub_activities:
                            total_govt_budget += Decimal(str(sub_activity.government_treasury or 0))
                            total_sdg_budget += Decimal(str(sub_activity.sdg_funding or 0))
                            total_partners_budget += Decimal(str(sub_activity.partners_funding or 0))
                            total_other_budget += Decimal(str(sub_activity.other_funding or 0))
                except Exception as sub_error:
                    # Log the error but don't fail the entire request
                    logger.warning(f"Error calculating budget for report {report.id}: {str(sub_error)}")

            total_budget = float(total_govt_budget + total_sdg_budget + total_partners_budget + total_other_budget)
            total_utilized = total_govt_utilized + total_sdg_utilized + total_partners_utilized + total_other_utilized
            total_remaining = total_budget - total_utilized

            organization_reports.append({
                'report_id': report.id,
                'organization_id': report.organization.id,
                'organization_name': report.organization.name,
                'report_type': report.report_type,
                'report_date': report.report_date.isoformat(),
                'status': report.status,
                'overall_achievement': round(avg_achievement, 2),
                'budget_utilization': {
                    'government_treasury_utilized': round(total_govt_utilized, 2),
                    'sdg_funding_utilized': round(total_sdg_utilized, 2),
                    'partners_funding_utilized': round(total_partners_utilized, 2),
                    'other_funding_utilized': round(total_other_utilized, 2),
                    'government_treasury_budget': round(float(total_govt_budget), 2),
                    'sdg_funding_budget': round(float(total_sdg_budget), 2),
                    'partners_funding_budget': round(float(total_partners_budget), 2),
                    'other_funding_budget': round(float(total_other_budget), 2),
                    'total_budget': round(total_budget, 2),
                    'total_utilized': round(total_utilized, 2),
                    'total_remaining': round(total_remaining, 2),
                    'total': round(total_utilized, 2)
                }
            })

        # Get budget utilization aggregated by organization and source
        budget_utilization_by_org = []
        for org in organizations:
            org_reports = Report.objects.filter(
                organization=org,
                status='APPROVED'
            )

            if not org_reports.exists():
                continue

            budget_utils = SubActivityBudgetUtilization.objects.filter(
                report__in=org_reports
            )

            total_govt = sum(float(bu.government_treasury_utilized or 0) for bu in budget_utils)
            total_sdg = sum(float(bu.sdg_funding_utilized or 0) for bu in budget_utils)
            total_partners = sum(float(bu.partners_funding_utilized or 0) for bu in budget_utils)
            total_other = sum(float(bu.other_funding_utilized or 0) for bu in budget_utils)

            if total_govt + total_sdg + total_partners + total_other > 0:
                budget_utilization_by_org.append({
                    'organization_id': org.id,
                    'organization_name': org.name,
                    'government_treasury': round(total_govt, 2),
                    'sdg_funding': round(total_sdg, 2),
                    'partners_funding': round(total_partners, 2),
                    'other_funding': round(total_other, 2),
                    'total': round(total_govt + total_sdg + total_partners + total_other, 2)
                })

        return Response({
            'submission_stats': {
                'total_organizations': total_orgs,
                'submitted': submitted_count,
                'not_submitted': not_submitted_count
            },
            'objective_achievements_by_org': objective_achievements_by_org,
            'organization_reports': organization_reports,
            'budget_utilization_by_org': budget_utilization_by_org
        }, status=status.HTTP_200_OK)

    except Exception as e:
        import traceback
        error_details = {
            'error': str(e),
            'type': type(e).__name__,
            'traceback': traceback.format_exc()
        }
        logger.exception("Error getting report statistics")
        logger.error(f"Error details: {error_details}")
        return Response({'error': str(e), 'details': error_details}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reviewed_plans_summary(request):
    """
    Optimized endpoint for reviewed plans tab.
    Returns only necessary data for approved and rejected plans.
    """
    try:
        from django.db.models import Q

        # Get query parameters
        status_filter = request.GET.get('status', 'all')
        org_filter = request.GET.get('organization', 'all')
        search = request.GET.get('search', '')

        # Build query
        query = Q(status__in=['APPROVED', 'REJECTED'])

        if status_filter != 'all':
            query &= Q(status=status_filter)

        if org_filter != 'all':
            query &= Q(organization_id=org_filter)

        if search:
            query &= (
                Q(organization__name__icontains=search) |
                Q(organization__code__icontains=search) |
                Q(user__email__icontains=search)
            )

        # Fetch plans with related data
        plans = Plan.objects.filter(query).select_related(
            'organization', 'user'
        ).values(
            'id', 'organization_id', 'organization__name', 'organization__code',
            'status', 'submitted_at', 'reviewed_at', 'user__email',
            'review_comment', 'plan_type'
        ).order_by('-reviewed_at')

        return Response({
            'plans': list(plans),
            'count': len(plans)
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching reviewed plans")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def budget_by_activity_summary(request):
    """
    Optimized endpoint for budget by activity tab.
    Pre-aggregates budget data by organization and activity type on the backend.
    """
    try:
        from django.db.models import Q, Sum, Count, Case, When, DecimalField, F
        from decimal import Decimal

        # Get approved plans
        approved_plans = Plan.objects.filter(status='APPROVED').select_related('organization').values(
            'program_id', 'organization_id', 'organization__name', 'organization__code'
        ).distinct()

        # Create mapping of program to organization
        program_to_org = {}
        for plan in approved_plans:
            if plan['program_id'] and plan['program_id'] not in program_to_org:
                program_to_org[plan['program_id']] = {
                    'org_id': plan['organization_id'],
                    'org_name': plan['organization__name'],
                    'org_code': plan['organization__code']
                }

        # Get sub-activities for approved programs
        sub_activities = SubActivity.objects.filter(
            main_activity__initiative__program_id__in=program_to_org.keys()
        ).values('main_activity__initiative__program_id', 'activity_type').annotate(
            count=Count('id'),
            with_tool_sum=Sum(
                Case(
                    When(budget_calculation_type='WITH_TOOL', then=F('estimated_cost_with_tool')),
                    default=0,
                    output_field=DecimalField()
                )
            ),
            without_tool_sum=Sum(
                Case(
                    When(budget_calculation_type='WITHOUT_TOOL', then=F('estimated_cost_without_tool')),
                    default=0,
                    output_field=DecimalField()
                )
            )
        )

        # Create organization map
        org_map = {}

        # Populate data
        for item in sub_activities:
            program_id = item['main_activity__initiative__program_id']
            if program_id not in program_to_org:
                continue

            org_info = program_to_org[program_id]
            org_id = org_info['org_id']

            if org_id not in org_map:
                org_map[org_id] = {
                    'organization_id': org_id,
                    'organization_name': org_info['org_name'] or f'ORG-{org_id}',
                    'organization_code': org_info['org_code'] or f'ORG-{org_id:04d}',
                    'Meeting / Workshop': {'count': 0, 'budget': 0},
                    'Training': {'count': 0, 'budget': 0},
                    'Supervision': {'count': 0, 'budget': 0},
                    'Procurement': {'count': 0, 'budget': 0},
                    'Printing': {'count': 0, 'budget': 0},
                    'Other': {'count': 0, 'budget': 0},
                    'total_count': 0,
                    'total_budget': 0
                }

            activity_type = item['activity_type'] or 'Other'
            count = item['count']
            budget = float(item['with_tool_sum'] or 0) + float(item['without_tool_sum'] or 0)

            if activity_type in org_map[org_id]:
                org_map[org_id][activity_type]['count'] = count
                org_map[org_id][activity_type]['budget'] = budget
                org_map[org_id]['total_count'] += count
                org_map[org_id]['total_budget'] += budget

        return Response({
            'data': list(org_map.values())
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching budget by activity")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def executive_performance_summary(request):
    """
    Optimized endpoint for executive performance tab.
    Pre-aggregates performance and budget data by organization on the backend.
    """
    try:
        from django.db.models import Q, Sum, Count, Case, When, DecimalField, F
        from decimal import Decimal

        # Get approved plans
        approved_plans = Plan.objects.filter(status='APPROVED').select_related('organization').values(
            'program_id', 'organization_id', 'organization__name', 'organization__code'
        ).distinct()

        # Create mapping of program to organization
        program_to_org = {}
        for plan in approved_plans:
            if plan['program_id'] and plan['program_id'] not in program_to_org:
                program_to_org[plan['program_id']] = {
                    'org_id': plan['organization_id'],
                    'org_name': plan['organization__name'],
                    'org_code': plan['organization__code']
                }

        # Get budget data for approved programs
        budget_data = SubActivity.objects.filter(
            main_activity__initiative__program_id__in=program_to_org.keys()
        ).values('main_activity__initiative__program_id').annotate(
            total_cost=Sum(
                Case(
                    When(budget_calculation_type='WITH_TOOL', then=F('estimated_cost_with_tool')),
                    When(budget_calculation_type='WITHOUT_TOOL', then=F('estimated_cost_without_tool')),
                    default=0,
                    output_field=DecimalField()
                )
            ),
            gov_funding=Sum('government_treasury'),
            partners_funding=Sum('partners_funding'),
            sdg_funding=Sum('sdg_funding'),
            other_funding=Sum('other_funding')
        )

        # Create organization performance map
        org_performance = {}

        # Populate budget data
        for item in budget_data:
            program_id = item['main_activity__initiative__program_id']
            if program_id not in program_to_org:
                continue

            org_info = program_to_org[program_id]
            org_id = org_info['org_id']

            if org_id not in org_performance:
                org_performance[org_id] = {
                    'organization_id': org_id,
                    'organization_name': org_info['org_name'] or f'ORG-{org_id}',
                    'organization_code': org_info['org_code'] or f'ORG-{org_id:04d}',
                    'total_plans': 0,
                    'approved': 0,
                    'submitted': 0,
                    'total_budget': 0,
                    'available_funding': 0,
                    'government_budget': 0,
                    'sdg_budget': 0,
                    'partners_budget': 0,
                    'funding_gap': 0
                }

            total_cost = float(item['total_cost'] or 0)
            gov = float(item['gov_funding'] or 0)
            partners = float(item['partners_funding'] or 0)
            sdg = float(item['sdg_funding'] or 0)
            other = float(item['other_funding'] or 0)
            total_funding = gov + partners + sdg + other

            org_performance[org_id]['total_budget'] = total_cost
            org_performance[org_id]['available_funding'] = total_funding
            org_performance[org_id]['government_budget'] = gov
            org_performance[org_id]['sdg_budget'] = sdg
            org_performance[org_id]['partners_budget'] = partners
            org_performance[org_id]['funding_gap'] = max(0, total_cost - total_funding)

        # Get plan counts for each organization (APPROVED only since we're filtering by approved)
        plans_data = Plan.objects.filter(
            status='APPROVED',
            organization_id__in=org_performance.keys()
        ).values('organization_id').annotate(
            count=Count('id')
        )

        for item in plans_data:
            org_id = item['organization_id']
            if org_id in org_performance:
                org_performance[org_id]['total_plans'] = item['count']
                org_performance[org_id]['approved'] = item['count']
                # submitted remains 0 since we only show approved

        return Response({
            'data': list(org_performance.values())
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching executive performance")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)